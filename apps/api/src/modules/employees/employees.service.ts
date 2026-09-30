import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { EMPLOYEE_POSITION_ROLE } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { recordCashTransaction } from '../cash/cash.service';
import { resolveSessionId } from '../work-sessions/session-link';
import { assertPlanLimit } from '../subscriptions/subscriptions.service';
import { SellersService } from '../sellers/sellers.service';
import { PaySellerSalaryDto } from '../sellers/dto/seller.dto';
import {
  AttendanceQueryDto,
  CreateEmployeeDto,
  EndShiftDto,
  MarkAttendanceDto,
  PaySalaryDto,
  SalaryListQueryDto,
  StartShiftDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellersService: SellersService,
  ) {}

  async list(tenantId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    const userIds = employees.map((e) => e.userId).filter((id): id is string => !!id);
    const [users, sellerProfiles] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds }, tenantId },
            select: { id: true, roleId: true, role: { select: { name: true } }, deletedAt: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.sellerProfile.findMany({ where: { userId: { in: userIds }, tenantId } })
        : Promise.resolve([]),
    ]);
    const usersById = new Map(users.map((u) => [u.id, u]));
    const sellerByUserId = new Map(sellerProfiles.map((s) => [s.userId, s]));
    const sellerProfileIds = sellerProfiles.map((s) => s.id);
    const [saleStats, commissionStats] = sellerProfileIds.length
      ? await Promise.all([
          this.prisma.sale.groupBy({
            by: ['createdById'],
            where: { tenantId, createdById: { in: sellerProfiles.map((s) => s.userId) } },
            _count: { _all: true },
            _sum: { total: true },
          }),
          this.prisma.commissionEntry.groupBy({
            by: ['sellerProfileId'],
            where: { tenantId, sellerProfileId: { in: sellerProfileIds } },
            _sum: { amount: true },
          }),
        ])
      : [[], []];
    const saleByUser = new Map(saleStats.map((s) => [s.createdById, s]));
    const commissionByProfile = new Map(commissionStats.map((s) => [s.sellerProfileId, s]));

    return employees
      // A deleted login account (soft-delete) removes the person from view here; their Employee
      // row and all financial/work-session history are untouched, just no longer listed.
      .filter((employee) => !employee.userId || !usersById.get(employee.userId)?.deletedAt)
      .map((employee) => {
        const user = employee.userId ? usersById.get(employee.userId) : undefined;
        const seller = employee.userId ? sellerByUserId.get(employee.userId) : undefined;
        return {
          ...employee,
          roleId: user?.roleId ?? null,
          roleName: user?.role.name ?? null,
          sellerProfileId: seller?.id ?? null,
          commissionPercent: seller?.commissionPercent ?? null,
          salesCount: seller ? (saleByUser.get(employee.userId!)?._count._all ?? 0) : null,
          salesTotal: seller ? (saleByUser.get(employee.userId!)?._sum.total ?? new Prisma.Decimal(0)) : null,
          commissionTotal: seller
            ? (commissionByProfile.get(seller.id)?._sum.amount ?? new Prisma.Decimal(0))
            : null,
        };
      });
  }

  /** Pay commission to an employee's linked seller profile (created when they were hired as position=Seller) */
  async payCommission(tenantId: string, userId: string, employeeId: string, dto: PaySellerSalaryDto) {
    const employee = await this.get(tenantId, employeeId);
    const seller = employee.userId
      ? await this.prisma.sellerProfile.findFirst({ where: { userId: employee.userId, tenantId } })
      : null;
    if (!seller) throw new NotFoundException('This employee has no linked seller/commission profile');
    return this.sellersService.paySalary(tenantId, userId, seller.id, dto);
  }

  /**
   * Create employee — if email is provided (and createLogin is not explicitly false), a real user account
   * is created with the role matching the selected position and linked to the employee; the initial password
   * is returned only once in the response (it is never logged or stored).
   */
  async create(tenantId: string, dto: CreateEmployeeDto) {
    const shouldCreateLogin = !!dto.email && dto.createLogin !== false;
    if (!shouldCreateLogin) {
      return this.prisma.employee.create({
        data: {
          tenantId,
          fullName: dto.fullName,
          position: dto.position,
          phone: dto.phone,
          payType: dto.payType,
          salary: new Prisma.Decimal(dto.salary),
          hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : undefined,
          userId: dto.userId,
          notes: dto.notes,
        },
      });
    }

    if (await this.prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } })) {
      throw new ConflictException('This email is already registered');
    }
    await assertPlanLimit(this.prisma, tenantId, 'users');
    const role = dto.roleId
      ? await this.prisma.role.findFirst({
          where: { id: dto.roleId, OR: [{ tenantId: null }, { tenantId }] },
          select: { id: true },
        })
      : await this.prisma.role.findFirst({
          where: { tenantId: null, key: EMPLOYEE_POSITION_ROLE[dto.positionPreset ?? 'OTHER'], isSystem: true },
          select: { id: true },
        });
    if (!role) throw new NotFoundException('Role not found');

    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const employee = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email: dto.email!,
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone,
          roleId: role.id,
        },
      });
      return tx.employee.create({
        data: {
          tenantId,
          fullName: dto.fullName,
          position: dto.position,
          phone: dto.phone,
          payType: dto.payType,
          salary: new Prisma.Decimal(dto.salary),
          hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : undefined,
          userId: user.id,
          notes: dto.notes,
        },
      });
    });

    if (dto.positionPreset === 'SELLER' && employee.userId) {
      await this.sellersService.create(tenantId, {
        userId: employee.userId,
        payType: dto.payType,
        commissionPercent: dto.commissionPercent,
        fixedSalaryAmount: dto.fixedSalaryAmount,
      });
    }
    return { ...employee, tempPassword };
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto) {
    await this.get(tenantId, id);
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.position && { position: dto.position }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.payType && { payType: dto.payType }),
        ...(dto.salary != null && { salary: new Prisma.Decimal(dto.salary) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async get(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, tenantId } });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  /** Pay salary: payment row + register expense (if a register is selected and the payment is PAID) */
  async paySalary(tenantId: string, userId: string, employeeId: string, dto: PaySalaryDto) {
    const employee = await this.get(tenantId, employeeId);
    const amount = new Prisma.Decimal(dto.amount);
    const bonus = new Prisma.Decimal(dto.bonus ?? 0);
    const deduction = new Prisma.Decimal(dto.deduction ?? 0);
    const status = dto.status ?? 'PAID';
    const netAmount = amount.plus(bonus).minus(deduction);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.salaryPayment.create({
        data: {
          tenantId,
          employeeId,
          amount,
          bonus,
          deduction,
          status,
          period: dto.period,
          registerId: dto.registerId,
          note: dto.note,
          receiptImageUrl: dto.receiptImageUrl,
          performedById: userId,
          paidAt: status === 'PAID' ? new Date() : undefined,
        },
      });
      if (dto.registerId && status === 'PAID') {
        await recordCashTransaction(tx, {
          tenantId,
          userId,
          registerId: dto.registerId,
          type: 'EXPENSE',
          amount: netAmount,
          category: 'Salary',
          note: `Salary for ${employee.fullName} — ${dto.period}`,
          referenceType: 'salary',
          referenceId: payment.id,
          sessionId: await resolveSessionId(tx, tenantId, userId, dto.sessionId),
        });
      }
      return payment;
    });
  }

  /** Transition a PENDING salary payment to PAID, recording the deferred cash effect */
  async markSalaryPaid(tenantId: string, userId: string, employeeId: string, paymentId: string, registerId?: string) {
    const employee = await this.get(tenantId, employeeId);
    const payment = await this.prisma.salaryPayment.findFirst({
      where: { id: paymentId, tenantId, employeeId },
    });
    if (!payment) throw new NotFoundException('Salary payment not found');
    if (payment.status === 'PAID') throw new ConflictException('This salary payment is already marked as paid');
    const effectiveRegisterId = registerId ?? payment.registerId ?? undefined;
    const netAmount = payment.amount.plus(payment.bonus).minus(payment.deduction);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.salaryPayment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          ...(effectiveRegisterId && { registerId: effectiveRegisterId }),
        },
      });
      if (effectiveRegisterId) {
        await recordCashTransaction(tx, {
          tenantId,
          userId,
          registerId: effectiveRegisterId,
          type: 'EXPENSE',
          amount: netAmount,
          category: 'Salary',
          note: `Salary for ${employee.fullName} — ${payment.period}`,
          referenceType: 'salary',
          referenceId: payment.id,
        });
      }
      return updated;
    });
  }

  async salaryPayments(tenantId: string, query: SalaryListQueryDto) {
    const where = { tenantId, ...(query.employeeId && { employeeId: query.employeeId }) };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.salaryPayment.findMany({
        where,
        skip,
        take: query.limit,
        include: { employee: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.salaryPayment.count({ where }),
    ]);
    const items = rows.map(({ employee, ...payment }) => ({
      ...payment,
      netAmount: payment.amount.plus(payment.bonus).minus(payment.deduction),
      employeeName: employee.fullName,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async shifts(tenantId: string, employeeId: string) {
    await this.get(tenantId, employeeId);
    return this.prisma.employeeShift.findMany({
      where: { tenantId, employeeId },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Session start of work — from what time and with what initial cash balance */
  async startShift(tenantId: string, userId: string, employeeId: string, dto: StartShiftDto) {
    await this.get(tenantId, employeeId);
    const open = await this.prisma.employeeShift.findFirst({
      where: { tenantId, employeeId, endedAt: null },
    });
    if (open) throw new ConflictException('This employee has an open shift — end it first');
    return this.prisma.employeeShift.create({
      data: {
        tenantId,
        employeeId,
        registerId: dto.registerId,
        openingCash: new Prisma.Decimal(dto.openingCash),
        startedById: userId,
      },
    });
  }

  async endShift(tenantId: string, userId: string, employeeId: string, shiftId: string, dto: EndShiftDto) {
    const shift = await this.prisma.employeeShift.findFirst({
      where: { id: shiftId, tenantId, employeeId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.endedAt) throw new ConflictException('This shift has already ended');
    return this.prisma.employeeShift.update({
      where: { id: shiftId },
      data: {
        closingCash: new Prisma.Decimal(dto.closingCash),
        endedAt: new Date(),
        endedById: userId,
      },
    });
  }

  /** Attendance — defaults to the current month if the from/to range is not provided */
  async attendance(tenantId: string, employeeId: string, query: AttendanceQueryDto) {
    await this.get(tenantId, employeeId);
    const now = new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = query.to
      ? new Date(query.to)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const rows = await this.prisma.employeeAttendance.findMany({
      where: { tenantId, employeeId, date: { gte: from, lte: to } },
      include: { recordedBy: { select: { fullName: true } } },
      orderBy: { date: 'desc' },
    });
    return rows.map(({ recordedBy, ...row }) => ({ ...row, recordedByName: recordedBy.fullName }));
  }

  /** Record/update attendance for a day — upsert on [employeeId, date] */
  async markAttendance(tenantId: string, userId: string, employeeId: string, dto: MarkAttendanceDto) {
    await this.get(tenantId, employeeId);
    const date = new Date(dto.date);
    return this.prisma.employeeAttendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: {
        tenantId,
        employeeId,
        date,
        status: dto.status,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        note: dto.note,
        recordedById: userId,
      },
      update: {
        status: dto.status,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : null,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
        note: dto.note,
        recordedById: userId,
      },
    });
  }
}
