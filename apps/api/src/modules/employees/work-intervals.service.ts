import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EmployeeWorkInterval, Prisma } from '@prisma/client';
import { KABUL_UTC_OFFSET_MINUTES } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { createSalaryPayment } from './salary-payment';
import { ApproveIntervalDto, HourlyPayDto, RejectIntervalDto, WorkIntervalRangeDto } from './dto/work-interval.dto';

const OFFSET_MS = KABUL_UTC_OFFSET_MINUTES * 60_000;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** [start, end) in UTC for a Kabul calendar-day range, both days inclusive */
export function kabulRange(range: WorkIntervalRangeDto) {
  const day = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d) - OFFSET_MS;
  };
  const start = day(range.from);
  const end = day(range.to) + 86_400_000;
  if (!(end > start)) throw new BadRequestException('"to" must be on or after "from"');
  if (end - start > 400 * 86_400_000) throw new BadRequestException('Choose a range of at most about a year');
  return { start: new Date(start), end: new Date(end) };
}

/** Whole minutes between two instants; null when there is no trustworthy end */
export function minutesBetween(start: Date, end: Date | null): number | null {
  if (!end || end.getTime() <= start.getTime()) return null;
  return Math.floor((end.getTime() - start.getTime()) / 60_000);
}

/** Exact pay for minutes at a rate, rounded once to cents (half-up) */
export function payFor(minutes: number, rate: Prisma.Decimal.Value): Prisma.Decimal {
  return D(rate).mul(minutes).div(60).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

type Row = EmployeeWorkInterval & { attendance: { date: Date } | null; workSession: { code: string } | null };

/** Effective [start, end) of a stretch for overlap checks — approved minutes win, else the recorded end */
function span(r: Pick<EmployeeWorkInterval, 'startAt' | 'endAt' | 'approvedMinutes'>): [number, number] | null {
  const start = r.startAt.getTime();
  if (r.approvedMinutes != null) return [start, start + r.approvedMinutes * 60_000];
  if (r.endAt && r.endAt.getTime() > start) return [start, r.endAt.getTime()];
  return null;
}
const overlaps = (a: [number, number] | null, b: [number, number] | null) => !!a && !!b && a[0] < b[1] && b[0] < a[1];

/**
 * Hourly payroll: every attendance day (with times) and every work session of an HOURLY employee becomes
 * one reviewable stretch. Each source feeds payroll at most once (DB unique). Only APPROVED stretches can be
 * paid, and paying links them to the salary payment in the same transaction — so hours are never paid twice.
 */
@Injectable()
export class WorkIntervalsService {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, fullName: true } });
  }

  private async hourlyEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId, deletedAt: null } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.payType !== 'HOURLY') throw new BadRequestException('This employee is not paid hourly');
    return employee;
  }

  /**
   * Bring the stretches in the range up to date with their sources. Only PENDING / REJECTED stretches follow
   * their source; APPROVED and PAID ones are never changed here. A source that no longer represents
   * work (e.g. attendance changed to Absent) drops its PENDING stretch.
   */
  async sync(tenantId: string, employeeId: string, range: WorkIntervalRangeDto) {
    await this.hourlyEmployee(tenantId, employeeId);
    const { start, end } = kabulRange(range);
    const [attendance, sessions, existing] = await Promise.all([
      this.prisma.employeeAttendance.findMany({
        where: { tenantId, employeeId, date: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) } },
      }),
      this.prisma.workSession.findMany({ where: { tenantId, employeeId, startedAt: { gte: start, lt: end } } }),
      this.prisma.employeeWorkInterval.findMany({ where: { tenantId, employeeId } , select: { id: true, attendanceId: true, workSessionId: true, status: true } }),
    ]);
    const byAttendance = new Map(existing.filter((e) => e.attendanceId).map((e) => [e.attendanceId!, e]));
    const bySession = new Map(existing.filter((e) => e.workSessionId).map((e) => [e.workSessionId!, e]));

    await this.prisma.$transaction(async (tx) => {
      for (const a of attendance) {
        const current = byAttendance.get(a.id);
        const works = (a.status === 'PRESENT' || a.status === 'HALF_DAY') && !!a.checkIn;
        if (!works) {
          if (current?.status === 'PENDING') await tx.employeeWorkInterval.delete({ where: { id: current.id } });
          continue;
        }
        const data = { startAt: a.checkIn!, endAt: a.checkOut, recordedMinutes: minutesBetween(a.checkIn!, a.checkOut) };
        if (!current) await tx.employeeWorkInterval.create({ data: { tenantId, employeeId, attendanceId: a.id, ...data } });
        else if (current.status === 'PENDING' || current.status === 'REJECTED') {
          await tx.employeeWorkInterval.update({ where: { id: current.id }, data });
        }
      }
      for (const s of sessions) {
        const current = bySession.get(s.id);
        const data = { startAt: s.startedAt, endAt: s.closedAt, recordedMinutes: minutesBetween(s.startedAt, s.closedAt) };
        if (!current) await tx.employeeWorkInterval.create({ data: { tenantId, employeeId, workSessionId: s.id, ...data } });
        else if (current.status === 'PENDING' || current.status === 'REJECTED') {
          await tx.employeeWorkInterval.update({ where: { id: current.id }, data });
        }
      }
    });
    return this.list(tenantId, employeeId, range);
  }

  /** Stretches that start in the range, with overlap and needs-review flags */
  async list(tenantId: string, employeeId: string, range: WorkIntervalRangeDto) {
    await this.hourlyEmployee(tenantId, employeeId);
    const { start, end } = kabulRange(range);
    const rows: Row[] = await this.prisma.employeeWorkInterval.findMany({
      where: { tenantId, employeeId, startAt: { gte: start, lt: end } },
      include: { attendance: { select: { date: true } }, workSession: { select: { code: true } } },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    // overlaps are checked against every live stretch of this employee, not only those in the range
    const live = await this.prisma.employeeWorkInterval.findMany({
      where: { tenantId, employeeId, status: { not: 'REJECTED' } },
      select: { id: true, startAt: true, endAt: true, approvedMinutes: true },
    });
    return rows.map((r) => this.toDto(r, live));
  }

  private toDto(r: Row, live: Pick<EmployeeWorkInterval, 'id' | 'startAt' | 'endAt' | 'approvedMinutes'>[]) {
    const mine = span(r);
    return {
      id: r.id,
      employeeId: r.employeeId,
      source: r.attendanceId ? ('ATTENDANCE' as const) : ('WORK_SESSION' as const),
      sourceLabel: r.attendance ? `Attendance ${r.attendance.date.toISOString().slice(0, 10)}` : `Work session ${r.workSession?.code ?? ''}`,
      startAt: r.startAt,
      endAt: r.endAt,
      recordedMinutes: r.recordedMinutes,
      approvedMinutes: r.approvedMinutes,
      hourlyRate: r.hourlyRate?.toString() ?? null,
      status: r.status,
      correctionReason: r.correctionReason,
      approvedAt: r.approvedAt,
      salaryPaymentId: r.salaryPaymentId,
      paidAt: r.paidAt,
      overlapsWith: r.status === 'REJECTED' ? [] : live.filter((o) => o.id !== r.id && overlaps(mine, span(o))).map((o) => o.id),
      needsReview: r.recordedMinutes == null,
    };
  }

  /** Lock one stretch row for the rest of the transaction */
  private async lockInterval(tx: Prisma.TransactionClient, tenantId: string, employeeId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM "EmployeeWorkInterval" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.employeeWorkInterval.findFirst({ where: { id, tenantId, employeeId } });
    if (!row) throw new NotFoundException('Work stretch not found');
    return row;
  }

  async approve(tenantId: string, userId: string, employeeId: string, id: string, dto: ApproveIntervalDto) {
    const user = await this.actor(userId);
    const employee = await this.hourlyEmployee(tenantId, employeeId);
    if (!employee.hourlyRate || !employee.hourlyRate.greaterThan(0)) {
      throw new BadRequestException('Set an hourly rate for this employee first');
    }
    return this.prisma.$transaction(async (tx) => {
      // serialise approvals of this employee so two admins can't approve overlapping stretches at once
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`;
      const row = await this.lockInterval(tx, tenantId, employeeId, id);
      if (row.status === 'PAID') throw new ConflictException('These hours are already paid and locked');
      if (row.status === 'APPROVED') throw new ConflictException('Already approved — reject it first to change it');

      const minutes = dto.approvedMinutes ?? row.recordedMinutes;
      if (minutes == null) {
        throw new BadRequestException('No trustworthy end time — enter the payable minutes and a reason');
      }
      const corrected = minutes !== row.recordedMinutes;
      if (corrected && !dto.reason) throw new BadRequestException('A reason is required when correcting the minutes');

      const others = await tx.employeeWorkInterval.findMany({
        where: { tenantId, employeeId, id: { not: id }, status: { in: ['APPROVED', 'PAID'] } },
        select: { id: true, startAt: true, endAt: true, approvedMinutes: true },
      });
      const mine = span({ startAt: row.startAt, endAt: row.endAt, approvedMinutes: minutes });
      if (others.some((o) => overlaps(mine, span(o)))) {
        throw new ConflictException('This time overlaps hours that are already approved or paid — reject one of them first');
      }

      const updated = await tx.employeeWorkInterval.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedMinutes: minutes,
          hourlyRate: employee.hourlyRate,
          correctionReason: corrected ? dto.reason : null,
          approvedById: user.id,
          approvedAt: new Date(),
        },
      });
      await tx.employeeWorkIntervalEvent.create({
        data: {
          tenantId,
          intervalId: id,
          action: corrected ? 'CORRECTED' : 'APPROVED',
          fromMinutes: row.recordedMinutes,
          toMinutes: minutes,
          reason: dto.reason ?? null,
          userId: user.id,
          userName: user.fullName,
        },
      });
      return updated;
    });
  }

  async reject(tenantId: string, userId: string, employeeId: string, id: string, dto: RejectIntervalDto) {
    const user = await this.actor(userId);
    await this.hourlyEmployee(tenantId, employeeId);
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInterval(tx, tenantId, employeeId, id);
      if (row.status === 'PAID') throw new ConflictException('These hours are already paid and locked');
      if (row.status === 'REJECTED') throw new ConflictException('Already rejected');
      const updated = await tx.employeeWorkInterval.update({
        where: { id },
        data: { status: 'REJECTED', approvedMinutes: null, hourlyRate: null, approvedById: null, approvedAt: null },
      });
      await tx.employeeWorkIntervalEvent.create({
        data: { tenantId, intervalId: id, action: 'REJECTED', fromMinutes: row.approvedMinutes ?? row.recordedMinutes, reason: dto.reason, userId: user.id, userName: user.fullName },
      });
      return updated;
    });
  }

  /** Approved, unpaid stretches that start in the range — exactly what "pay" would pay */
  async preview(tenantId: string, employeeId: string, range: WorkIntervalRangeDto) {
    await this.hourlyEmployee(tenantId, employeeId);
    const { start, end } = kabulRange(range);
    const rows = await this.prisma.employeeWorkInterval.findMany({
      where: { tenantId, employeeId, status: 'APPROVED', salaryPaymentId: null, startAt: { gte: start, lt: end } },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return summarize(range, rows);
  }

  async pay(tenantId: string, userId: string, employeeId: string, dto: HourlyPayDto) {
    const user = await this.actor(userId);
    const employee = await this.hourlyEmployee(tenantId, employeeId);
    const { start, end } = kabulRange(dto);
    const ids = [...new Set(dto.intervalIds)];
    return this.prisma.$transaction(async (tx) => {
      // lock exactly the previewed rows; a concurrent payment waits here and then finds them PAID
      await tx.$queryRaw`SELECT id FROM "EmployeeWorkInterval" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
      const rows = await tx.employeeWorkInterval.findMany({
        where: {
          id: { in: ids },
          tenantId,
          employeeId,
          status: 'APPROVED',
          salaryPaymentId: null,
          startAt: { gte: start, lt: end },
        },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      });
      if (rows.length !== ids.length) {
        throw new ConflictException('Some of these hours changed or were already paid — refresh the preview');
      }
      const summary = summarize(dto, rows);
      const amount = D(summary.totalAmount);
      if (!amount.greaterThan(0)) throw new UnprocessableEntityException('Nothing to pay for these hours');

      const payment = await createSalaryPayment(tx, {
        tenantId,
        userId: user.id,
        employee,
        amount,
        status: 'PAID',
        period: `${dto.from}..${dto.to}`,
        registerId: dto.registerId,
        note: dto.note ?? `Hourly pay: ${summary.totalMinutes} min`,
        receiptImageUrl: dto.receiptImageUrl,
        sessionId: dto.sessionId,
      });
      const now = new Date();
      const linked = await tx.employeeWorkInterval.updateMany({
        where: { id: { in: ids }, status: 'APPROVED', salaryPaymentId: null },
        data: { status: 'PAID', salaryPaymentId: payment.id, paidAt: now },
      });
      if (linked.count !== ids.length) throw new ConflictException('Hours changed while paying — nothing was paid, try again');
      await tx.employeeWorkIntervalEvent.createMany({
        data: rows.map((r) => ({
          tenantId,
          intervalId: r.id,
          action: 'PAID',
          toMinutes: r.approvedMinutes,
          reason: `Salary payment ${payment.id}`,
          userId: user.id,
          userName: user.fullName,
        })),
      });
      return { payment, ...summary };
    });
  }

  async events(tenantId: string, employeeId: string, id: string) {
    const row = await this.prisma.employeeWorkInterval.findFirst({ where: { id, tenantId, employeeId } });
    if (!row) throw new NotFoundException('Work stretch not found');
    return this.prisma.employeeWorkIntervalEvent.findMany({ where: { intervalId: id }, orderBy: { createdAt: 'asc' } });
  }
}

function summarize(range: WorkIntervalRangeDto, rows: EmployeeWorkInterval[]) {
  // exact total first, rounded once — line amounts are shown rounded but never summed
  let exact = D(0);
  let totalMinutes = 0;
  const intervals = rows.map((r) => {
    const minutes = r.approvedMinutes ?? 0;
    const rate = r.hourlyRate ?? D(0);
    exact = exact.add(rate.mul(minutes).div(60));
    totalMinutes += minutes;
    return { id: r.id, startAt: r.startAt, approvedMinutes: minutes, hourlyRate: rate.toString(), amount: payFor(minutes, rate).toString() };
  });
  return {
    from: range.from,
    to: range.to,
    intervals,
    totalMinutes,
    totalAmount: exact.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
  };
}
