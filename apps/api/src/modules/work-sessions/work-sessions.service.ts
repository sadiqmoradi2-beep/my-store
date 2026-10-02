import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IncomePart, Prisma } from '@prisma/client';
import { kabulGregorianMonthStartUtc, PERMISSIONS, ROLES, SessionRole, sessionResult } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  CloseSessionDto,
  CreateAdjustmentDto,
  CreateHarvestDto,
  DecideHarvestDto,
  ReopenSessionDto,
  SessionListQueryDto,
  SessionReportQueryDto,
  StartSessionDto,
  UpdateSessionDto,
} from './dto/work-session.dto';
import { findActiveSessionIdForUser } from './session-link';
import { computeFigures, SessionFigures } from './session-figures';

const DAY_MS = 86_400_000;
const CLOCK_SKEW_MS = 60_000;
const zero = () => new Prisma.Decimal(0);

const sessionInclude = {
  seller: { select: { userId: true } },
  employee: { select: { userId: true } },
  createdBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
} satisfies Prisma.WorkSessionInclude;

type SessionRow = Prisma.WorkSessionGetPayload<{ include: typeof sessionInclude }>;

/** Which relation column holds the person of each role */
const PERSON_FIELD = {
  SELLER: 'sellerProfileId',
  EMPLOYEE: 'employeeId',
  PARTNER: 'partnerId',
} as const;

function personIdOf(session: { sellerProfileId: string | null; employeeId: string | null; partnerId: string | null }) {
  return session.sellerProfileId ?? session.employeeId ?? session.partnerId ?? '';
}

@Injectable()
export class WorkSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────── permissions ─────────────────────────

  private async permissionsOf(user: RequestUser): Promise<Set<string>> {
    if (user.roleKey === ROLES.SUPER_ADMIN) return new Set(Object.values(PERMISSIONS));
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId: user.roleId },
      include: { permission: { select: { key: true } } },
    });
    return new Set(rows.map((r) => r.permission.key));
  }

  private ownsSession(session: SessionRow, userId: string): boolean {
    return session.seller?.userId === userId || session.employee?.userId === userId;
  }

  /** Loads a session the user is allowed to see — everyone with sessions.read, or the owner with sessions.read_own */
  private async findVisible(tenantId: string, user: RequestUser, id: string) {
    const perms = await this.permissionsOf(user);
    const session = await this.prisma.workSession.findFirst({ where: { id, tenantId }, include: sessionInclude });
    if (!session) throw new NotFoundException('Work session not found');
    if (!perms.has(PERMISSIONS.SESSIONS_READ)) {
      if (!perms.has(PERMISSIONS.SESSIONS_READ_OWN) || !this.ownsSession(session, user.userId)) {
        throw new NotFoundException('Work session not found');
      }
    }
    return { session, perms };
  }

  // ───────────────────────── reading ─────────────────────────

  async list(tenantId: string, user: RequestUser, query: SessionListQueryDto) {
    const perms = await this.permissionsOf(user);
    const canReadAll = perms.has(PERMISSIONS.SESSIONS_READ);
    if (!canReadAll && !perms.has(PERMISSIONS.SESSIONS_READ_OWN)) {
      throw new ForbiddenException('You do not have the required permissions: sessions.read');
    }
    const where: Prisma.WorkSessionWhereInput = {
      tenantId,
      ...(!canReadAll && { OR: [{ seller: { userId: user.userId } }, { employee: { userId: user.userId } }] }),
      ...(query.status && { status: query.status }),
      ...(query.role && { role: query.role }),
      ...(query.role && query.personId && { [PERSON_FIELD[query.role]]: query.personId }),
      ...(query.q && {
        AND: [
          {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { personName: { contains: query.q, mode: 'insensitive' } },
            ],
          },
        ],
      }),
      ...((query.from || query.to) && {
        startedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(new Date(query.to).getTime() + DAY_MS - 1) }),
        },
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.workSession.findMany({
        where,
        skip,
        take: query.limit,
        include: sessionInclude,
        orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
      }),
      this.prisma.workSession.count({ where }),
    ]);
    const figures = await computeFigures(this.prisma, tenantId, rows);
    return {
      items: rows.map((row) => this.toDto(row, figures.get(row.id)!)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  async get(tenantId: string, user: RequestUser, id: string) {
    const { session } = await this.findVisible(tenantId, user, id);
    const figures = await computeFigures(this.prisma, tenantId, [session]);
    return this.toDto(session, figures.get(session.id)!);
  }

  async mine(tenantId: string, user: RequestUser) {
    const id = await findActiveSessionIdForUser(this.prisma, tenantId, user.userId);
    if (!id) return null;
    return this.getRow(tenantId, id);
  }

  /** People who can hold a session, with the session they already have (to warn before a duplicate is started) */
  async people(tenantId: string) {
    const [employees, partners, active] = await Promise.all([
      this.prisma.employee.findMany({ where: { tenantId, isActive: true, deletedAt: null } }),
      this.prisma.partner.findMany({ where: { tenantId, isActive: true, deletedAt: null } }),
      this.prisma.workSession.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { id: true, code: true, sellerProfileId: true, employeeId: true, partnerId: true },
      }),
    ]);
    const activeOf = new Map(active.map((s) => [personIdOf(s), s]));
    const row = (role: SessionRole, id: string, name: string) => ({
      role,
      personId: id,
      name,
      activeSessionId: activeOf.get(id)?.id ?? null,
      activeSessionCode: activeOf.get(id)?.code ?? null,
    });
    return [
      ...employees.map((e) => row('EMPLOYEE', e.id, e.fullName)),
      ...partners.map((p) => row('PARTNER', p.id, p.name)),
    ];
  }

  async harvests(tenantId: string, user: RequestUser, id: string) {
    await this.findVisible(tenantId, user, id);
    const rows = await this.prisma.cashHarvest.findMany({
      where: { sessionId: id, tenantId },
      include: { requestedBy: { select: { fullName: true } }, collectedBy: { select: { fullName: true } } },
      orderBy: { harvestedAt: 'desc' },
    });
    return rows.map(({ requestedBy, collectedBy, ...h }) => ({
      ...h,
      requestedByName: requestedBy.fullName,
      collectedByName: collectedBy?.fullName ?? null,
    }));
  }

  async adjustments(tenantId: string, user: RequestUser, id: string) {
    await this.findVisible(tenantId, user, id);
    const rows = await this.prisma.sessionAdjustment.findMany({
      where: { sessionId: id, tenantId },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ createdBy, ...a }) => ({ ...a, createdByName: createdBy.fullName }));
  }

  async audit(tenantId: string, user: RequestUser, id: string) {
    await this.findVisible(tenantId, user, id);
    const rows = await this.prisma.workSessionAudit.findMany({
      where: { sessionId: id, tenantId },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ user: u, ...a }) => ({ ...a, userName: u.fullName }));
  }

  /** Chronological events of the session with the expected cash after each one */
  async timeline(tenantId: string, user: RequestUser, id: string) {
    const { session } = await this.findVisible(tenantId, user, id);
    const end = session.closedAt ?? new Date();
    const window = { gte: session.startedAt, lte: end };
    const [sales, flows, harvests, adjustments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId, sessionId: id, createdAt: window },
        select: { saleNumber: true, paymentMethod: true, total: true, createdAt: true },
      }),
      this.prisma.cashTransaction.findMany({
        where: { tenantId, sessionId: id, type: { not: 'SALE' }, createdAt: window },
        include: { register: { select: { part: true } } },
      }),
      this.prisma.cashHarvest.findMany({ where: { tenantId, sessionId: id } }),
      this.prisma.sessionAdjustment.findMany({ where: { tenantId, sessionId: id } }),
    ]);

    type Event = { at: Date; kind: string; label: string; amount: Prisma.Decimal; cash: Prisma.Decimal; note?: string | null };
    const events: Event[] = [
      { at: session.startedAt, kind: 'START', label: 'Session started', amount: session.openingCash, cash: session.openingCash },
    ];
    for (const s of sales) {
      events.push({
        at: s.createdAt,
        kind: 'SALE',
        label: `Sale #${s.saleNumber} (${s.paymentMethod})`,
        amount: s.total,
        cash: s.paymentMethod === 'CASH' ? s.total : zero(),
      });
    }
    for (const t of flows) {
      const isIn = t.type === 'INCOME';
      const isCash = t.register.part === 'CASH';
      events.push({
        at: t.createdAt,
        kind: isIn ? 'INCOME' : 'EXPENSE',
        label: `${t.category ?? (isIn ? 'Income' : 'Expense')} (${t.register.part})`,
        amount: isIn ? t.amount : t.amount.neg(),
        cash: isCash ? (isIn ? t.amount : t.amount.neg()) : zero(),
        note: t.note,
      });
    }
    for (const h of harvests) {
      const approved = h.status === 'APPROVED';
      events.push({
        at: h.harvestedAt,
        kind: 'HARVEST',
        label: `Cash harvest HRV-${String(h.number).padStart(4, '0')} (${h.method})${approved ? '' : ` — ${h.status.toLowerCase()}`}`,
        amount: h.amount.neg(),
        cash: approved && h.method === 'CASH' ? h.amount.neg() : zero(),
        note: h.note,
      });
    }
    for (const a of adjustments) {
      events.push({ at: a.createdAt, kind: 'ADJUSTMENT', label: 'Cash adjustment', amount: a.amount, cash: a.amount, note: a.reason });
    }
    if (session.closedAt) {
      events.push({ at: session.closedAt, kind: 'CLOSE', label: 'Session closed', amount: zero(), cash: zero(), note: session.closingNotes });
    }
    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    let running = zero();
    return events.map((e) => {
      running = running.add(e.cash);
      return {
        at: e.at,
        kind: e.kind,
        label: e.label,
        amount: e.amount,
        cashEffect: e.cash,
        balanceAfter: running,
        note: e.note ?? null,
      };
    });
  }

  /** Sessions overlapping the range, summed per person — used by the Income and Reports pages */
  async report(tenantId: string, query: SessionReportQueryDto) {
    const from = query.from ? new Date(query.from) : kabulGregorianMonthStartUtc();
    const to = query.to ? new Date(new Date(query.to).getTime() + DAY_MS - 1) : new Date();
    const sessions = await this.prisma.workSession.findMany({
      where: { tenantId, startedAt: { lte: to }, OR: [{ closedAt: null }, { closedAt: { gte: from } }] },
      take: 1000,
      orderBy: { startedAt: 'desc' },
    });
    const figures = await computeFigures(this.prisma, tenantId, sessions);

    const rows = new Map<string, {
      role: SessionRole; personId: string; personName: string; sessions: number;
      income: Prisma.Decimal; expenses: Prisma.Decimal; harvested: Prisma.Decimal; cashHeld: Prisma.Decimal; difference: Prisma.Decimal;
    }>();
    const totals = { activeCount: 0, closedCount: 0, cashHeld: zero(), income: zero(), expenses: zero(), harvested: zero(), difference: zero() };
    for (const s of sessions) {
      const f = figures.get(s.id)!;
      const key = `${s.role}:${personIdOf(s)}`;
      const row = rows.get(key) ?? {
        role: s.role, personId: personIdOf(s), personName: s.personName, sessions: 0,
        income: zero(), expenses: zero(), harvested: zero(), cashHeld: zero(), difference: zero(),
      };
      row.sessions += 1;
      row.income = row.income.add(f.salesTotal);
      row.expenses = row.expenses.add(f.totalExpenses);
      row.harvested = row.harvested.add(f.harvestedTotal);
      totals.income = totals.income.add(f.salesTotal);
      totals.expenses = totals.expenses.add(f.totalExpenses);
      totals.harvested = totals.harvested.add(f.harvestedTotal);
      if (s.status === 'ACTIVE') {
        totals.activeCount += 1;
        row.cashHeld = row.cashHeld.add(f.expectedCash);
        totals.cashHeld = totals.cashHeld.add(f.expectedCash);
      } else {
        totals.closedCount += 1;
        const diff = (s.actualClosingCash ?? zero()).sub(s.expectedClosingCash ?? zero());
        row.difference = row.difference.add(diff);
        totals.difference = totals.difference.add(diff);
      }
      rows.set(key, row);
    }
    return { from, to, rows: [...rows.values()].sort((a, b) => b.income.comparedTo(a.income)), totals };
  }

  // ───────────────────────── starting / editing ─────────────────────────

  async start(tenantId: string, userId: string, dto: StartSessionDto) {
    const startedAt = new Date(dto.startedAt);
    if (startedAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
      throw new UnprocessableEntityException('A session cannot start in the future');
    }
    const person = await this.resolvePerson(tenantId, dto.role, dto.personId);
    const field = PERSON_FIELD[dto.role];

    const existing = await this.prisma.workSession.findFirst({
      where: { tenantId, status: 'ACTIVE', [field]: dto.personId },
      select: { code: true },
    });
    if (existing) {
      throw new ConflictException(`${person.name} already has an active session (${existing.code}) — close it first`);
    }

    for (let attempt = 0; ; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const year = startedAt.getUTCFullYear();
          const prefix = `SES-${year}-`;
          const last = await tx.workSession.findFirst({
            where: { tenantId, code: { startsWith: prefix } },
            orderBy: { code: 'desc' },
            select: { code: true },
          });
          const next = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
          const session = await tx.workSession.create({
            data: {
              tenantId,
              code: `${prefix}${String(next).padStart(4, '0')}`,
              role: dto.role,
              [field]: dto.personId,
              personName: person.name,
              startedAt,
              openingCash: new Prisma.Decimal(dto.openingCash),
              harvestLimit: new Prisma.Decimal(dto.harvestLimit),
              openingNotes: dto.openingNotes,
              createdById: userId,
            },
          });
          await this.audit_(tx, tenantId, session.id, userId, 'session.created', null, {
            code: session.code,
            person: person.name,
            role: dto.role,
            startedAt,
            openingCash: dto.openingCash,
            harvestLimit: dto.harvestLimit,
          });
          return session;
        });
        return this.getRow(tenantId, created.id);
      } catch (error) {
        // two sessions started at the same moment got the same number — try the next one
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) continue;
        throw error;
      }
    }
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateSessionDto) {
    const session = await this.findRow(tenantId, id);
    if (session.status !== 'ACTIVE') throw new UnprocessableEntityException('Only an active session can be edited');
    const changes: Prisma.WorkSessionUpdateInput = {};
    const oldValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};
    if (dto.harvestLimit !== undefined && !session.harvestLimit.equals(dto.harvestLimit)) {
      oldValue.harvestLimit = session.harvestLimit;
      newValue.harvestLimit = dto.harvestLimit;
      changes.harvestLimit = new Prisma.Decimal(dto.harvestLimit);
    }
    if (dto.openingNotes !== undefined && dto.openingNotes !== session.openingNotes) {
      oldValue.openingNotes = session.openingNotes;
      newValue.openingNotes = dto.openingNotes;
      changes.openingNotes = dto.openingNotes;
    }
    if (Object.keys(changes).length === 0) return this.getRow(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.workSession.update({ where: { id }, data: changes });
      await this.audit_(tx, tenantId, id, userId, 'session.updated', oldValue, newValue, dto.reason);
    });
    return this.getRow(tenantId, id);
  }

  // ───────────────────────── harvests ─────────────────────────

  async createHarvest(tenantId: string, user: RequestUser, id: string, dto: CreateHarvestDto) {
    const { session, perms } = await this.findVisible(tenantId, user, id);
    if (session.status !== 'ACTIVE') throw new UnprocessableEntityException('Cash can only be harvested from an active session');
    const canHarvest = perms.has(PERMISSIONS.SESSIONS_HARVEST);
    const canRequest = perms.has(PERMISSIONS.SESSIONS_REQUEST_HARVEST) && this.ownsSession(session, user.userId);
    if (!canHarvest && !canRequest) throw new ForbiddenException('You cannot harvest or request a harvest for this session');

    const harvestedAt = dto.harvestedAt ? new Date(dto.harvestedAt) : new Date();
    if (harvestedAt < session.startedAt) throw new UnprocessableEntityException('A harvest cannot be before the session started');
    if (harvestedAt.getTime() > Date.now() + CLOCK_SKEW_MS) throw new UnprocessableEntityException('A harvest cannot be in the future');

    const method: IncomePart = dto.method ?? 'CASH';
    const figures = (await computeFigures(this.prisma, tenantId, [session])).get(id)!;
    this.assertHarvestAllowed(figures, new Prisma.Decimal(dto.amount), method, perms.has(PERMISSIONS.SESSIONS_OVERRIDE));

    const status = canHarvest ? 'APPROVED' : 'PENDING';
    const harvest = await this.prisma.$transaction(async (tx) => {
      const last = await tx.cashHarvest.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
      const created = await tx.cashHarvest.create({
        data: {
          tenantId,
          number: (last?.number ?? 0) + 1,
          sessionId: id,
          amount: new Prisma.Decimal(dto.amount),
          method,
          status,
          note: dto.note,
          harvestedAt,
          requestedById: user.userId,
          collectedById: canHarvest ? user.userId : null,
          decidedAt: canHarvest ? new Date() : null,
        },
      });
      await this.audit_(tx, tenantId, id, user.userId, status === 'APPROVED' ? 'harvest.created' : 'harvest.requested', null, {
        harvest: `HRV-${String(created.number).padStart(4, '0')}`,
        amount: dto.amount,
        method,
        status,
      });
      return created;
    });
    return harvest;
  }

  async approveHarvest(tenantId: string, user: RequestUser, id: string, harvestId: string) {
    const { session, perms } = await this.findVisible(tenantId, user, id);
    if (session.status !== 'ACTIVE') throw new UnprocessableEntityException('The session is closed');
    const harvest = await this.findHarvest(tenantId, id, harvestId);
    if (harvest.status !== 'PENDING') throw new UnprocessableEntityException('Only a pending request can be approved');
    const figures = (await computeFigures(this.prisma, tenantId, [session])).get(id)!;
    this.assertHarvestAllowed(figures, harvest.amount, harvest.method, perms.has(PERMISSIONS.SESSIONS_OVERRIDE));
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashHarvest.update({
        where: { id: harvestId },
        data: { status: 'APPROVED', collectedById: user.userId, decidedAt: new Date() },
      });
      await this.audit_(tx, tenantId, id, user.userId, 'harvest.approved', { status: 'PENDING' }, {
        status: 'APPROVED',
        harvest: `HRV-${String(harvest.number).padStart(4, '0')}`,
        amount: harvest.amount,
      });
      return updated;
    });
  }

  async rejectHarvest(tenantId: string, userId: string, id: string, harvestId: string, dto: DecideHarvestDto) {
    const harvest = await this.findHarvest(tenantId, id, harvestId);
    if (harvest.status !== 'PENDING') throw new UnprocessableEntityException('Only a pending request can be rejected');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashHarvest.update({
        where: { id: harvestId },
        data: { status: 'REJECTED', decidedAt: new Date() },
      });
      await this.audit_(tx, tenantId, id, userId, 'harvest.rejected', { status: 'PENDING' }, {
        status: 'REJECTED',
        harvest: `HRV-${String(harvest.number).padStart(4, '0')}`,
        amount: harvest.amount,
      }, dto.reason);
      return updated;
    });
  }

  /** A harvest may not exceed the remaining harvest limit, nor the cash in the box — unless the user may override */
  private assertHarvestAllowed(figures: SessionFigures, amount: Prisma.Decimal, method: IncomePart, override: boolean) {
    if (override) return;
    if (amount.greaterThan(figures.remainingHarvestLimit)) {
      throw new UnprocessableEntityException(
        `The harvest exceeds the remaining harvest limit (remaining: ${figures.remainingHarvestLimit.toString()})`,
      );
    }
    if (method === 'CASH' && amount.greaterThan(figures.expectedCash)) {
      throw new UnprocessableEntityException(
        `The harvest exceeds the cash in the box (available: ${figures.expectedCash.toString()})`,
      );
    }
  }

  // ───────────────────────── adjustments / closing / reopening ─────────────────────────

  async adjust(tenantId: string, userId: string, id: string, dto: CreateAdjustmentDto) {
    if (dto.amount === 0) throw new BadRequestException('An adjustment cannot be zero');
    const session = await this.findRow(tenantId, id);
    if (session.status !== 'ACTIVE') {
      throw new UnprocessableEntityException('Reopen the session before adding an adjustment');
    }
    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.sessionAdjustment.create({
        data: { tenantId, sessionId: id, amount: new Prisma.Decimal(dto.amount), reason: dto.reason, createdById: userId },
      });
      await this.audit_(tx, tenantId, id, userId, 'adjustment.created', null, { amount: dto.amount }, dto.reason);
      return adjustment;
    });
  }

  async close(tenantId: string, userId: string, id: string, dto: CloseSessionDto) {
    const session = await this.findRow(tenantId, id);
    if (session.status !== 'ACTIVE') throw new UnprocessableEntityException('The session is already closed');
    // A date-time picker only has minute precision: a time within the last minute means "right now",
    // so movements recorded seconds ago are not cut off from the closed session
    const requested = dto.closedAt ? new Date(dto.closedAt) : new Date();
    const closedAt = Math.abs(Date.now() - requested.getTime()) <= CLOCK_SKEW_MS ? new Date() : requested;
    if (closedAt < session.startedAt) throw new UnprocessableEntityException('The session cannot close before it started');
    if (closedAt.getTime() > Date.now() + CLOCK_SKEW_MS) throw new UnprocessableEntityException('The session cannot close in the future');
    const pending = await this.prisma.cashHarvest.count({ where: { sessionId: id, status: 'PENDING' } });
    if (pending > 0) {
      throw new UnprocessableEntityException(`Approve or reject the ${pending} pending harvest request(s) before closing`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workSession.update({ where: { id }, data: { status: 'CLOSED', closedAt, closedById: userId } });
      const figures = (await computeFigures(tx, tenantId, [session])).get(id)!;
      const actual = new Prisma.Decimal(dto.actualClosingCash);
      const difference = actual.sub(figures.expectedCash);
      await tx.workSession.update({
        where: { id },
        data: { actualClosingCash: actual, expectedClosingCash: figures.expectedCash, closingNotes: dto.closingNotes },
      });
      await this.audit_(tx, tenantId, id, userId, 'session.closed', { status: 'ACTIVE' }, {
        status: 'CLOSED',
        closedAt,
        expectedCash: figures.expectedCash,
        actualClosingCash: actual,
        difference,
        result: sessionResult(difference.toNumber()),
      });
    });
    return this.getRow(tenantId, id);
  }

  async reopen(tenantId: string, userId: string, id: string, dto: ReopenSessionDto) {
    const session = await this.findRow(tenantId, id);
    if (session.status !== 'CLOSED') throw new UnprocessableEntityException('Only a closed session can be reopened');
    const field = PERSON_FIELD[session.role];
    const other = await this.prisma.workSession.findFirst({
      where: { tenantId, status: 'ACTIVE', [field]: personIdOf(session), NOT: { id } },
      select: { code: true },
    });
    if (other) throw new ConflictException(`${session.personName} already has an active session (${other.code})`);
    await this.prisma.$transaction(async (tx) => {
      await tx.workSession.update({
        where: { id },
        data: { status: 'ACTIVE', closedAt: null, closedById: null, actualClosingCash: null, expectedClosingCash: null, closingNotes: null },
      });
      await this.audit_(tx, tenantId, id, userId, 'session.reopened', {
        closedAt: session.closedAt,
        actualClosingCash: session.actualClosingCash,
        expectedClosingCash: session.expectedClosingCash,
        closingNotes: session.closingNotes,
      }, { status: 'ACTIVE' }, dto.reason);
    });
    return this.getRow(tenantId, id);
  }

  // ───────────────────────── helpers ─────────────────────────

  private async resolvePerson(tenantId: string, role: SessionRole, personId: string): Promise<{ name: string }> {
    if (role === 'SELLER') {
      const seller = await this.prisma.sellerProfile.findFirst({
        where: { id: personId, tenantId, isActive: true, user: { deletedAt: null } },
        include: { user: { select: { fullName: true } } },
      });
      if (seller) return { name: seller.user.fullName };
    } else if (role === 'EMPLOYEE') {
      const employee = await this.prisma.employee.findFirst({
        where: { id: personId, tenantId, isActive: true, deletedAt: null },
      });
      if (employee) return { name: employee.fullName };
    } else {
      const partner = await this.prisma.partner.findFirst({ where: { id: personId, tenantId, isActive: true, deletedAt: null } });
      if (partner) return { name: partner.name };
    }
    throw new NotFoundException('Person not found or not active');
  }

  private async findRow(tenantId: string, id: string) {
    const session = await this.prisma.workSession.findFirst({ where: { id, tenantId }, include: sessionInclude });
    if (!session) throw new NotFoundException('Work session not found');
    return session;
  }

  private async getRow(tenantId: string, id: string) {
    const session = await this.findRow(tenantId, id);
    const figures = await computeFigures(this.prisma, tenantId, [session]);
    return this.toDto(session, figures.get(id)!);
  }

  private async findHarvest(tenantId: string, sessionId: string, harvestId: string) {
    const harvest = await this.prisma.cashHarvest.findFirst({ where: { id: harvestId, sessionId, tenantId } });
    if (!harvest) throw new NotFoundException('Harvest not found');
    return harvest;
  }

  private audit_(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sessionId: string,
    userId: string,
    action: string,
    oldValue: unknown,
    newValue: unknown,
    reason?: string | null,
  ) {
    return tx.workSessionAudit.create({
      data: {
        tenantId,
        sessionId,
        userId,
        action,
        oldValue: oldValue == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(oldValue)) as Prisma.InputJsonValue),
        newValue: newValue == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(newValue)) as Prisma.InputJsonValue),
        reason: reason ?? null,
      },
    });
  }

  private toDto(row: SessionRow, figures: SessionFigures) {
    const { seller, employee, createdBy, closedBy, ...session } = row;
    void seller;
    void employee;
    const end = session.closedAt ?? new Date();
    const expected = session.status === 'CLOSED' ? session.expectedClosingCash : figures.expectedCash;
    const difference =
      session.status === 'CLOSED' && session.actualClosingCash && expected ? session.actualClosingCash.sub(expected) : null;
    return {
      ...session,
      personId: personIdOf(session),
      createdByName: createdBy.fullName,
      closedByName: closedBy?.fullName ?? null,
      durationMinutes: Math.max(0, Math.floor((end.getTime() - session.startedAt.getTime()) / 60_000)),
      expectedClosingCash: expected,
      difference,
      result: difference ? sessionResult(difference.toNumber()) : null,
      figures,
    };
  }
}
