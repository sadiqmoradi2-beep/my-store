import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { computeFigures } from './session-figures';
import { WorkSessionsService } from './work-sessions.service';

jest.mock('./session-figures', () => ({ computeFigures: jest.fn() }));

const D = (v: number) => new Prisma.Decimal(v);
const admin = { userId: 'admin', roleId: 'r-admin', roleKey: 'ADMIN', tenantId: 't1', sub: 'admin' } as never;
const seller = { userId: 'seller-user', roleId: 'r-seller', roleKey: 'SELLER', tenantId: 't1', sub: 'seller-user' } as never;

const figures = (over: Record<string, unknown> = {}) => ({
  salesTotal: D(0), salesCash: D(0), salesProfit: D(0), salesCount: 0, otherCashReceived: D(0),
  cashExpenses: D(0), totalExpenses: D(0), harvestedTotal: D(0), harvestedCash: D(0), pendingHarvests: 0,
  adjustments: D(0), expectedCash: D(500), remainingHarvestLimit: D(1000), ...over,
});

const baseSession = {
  id: 's1', tenantId: 't1', code: 'SES-2026-0001', role: 'SELLER', sellerProfileId: 'sp1', employeeId: null, partnerId: null,
  personName: 'Ali', status: 'ACTIVE', startedAt: new Date('2026-09-01T09:00:00Z'), openingCash: D(500), harvestLimit: D(1000),
  openingNotes: null, closedAt: null, actualClosingCash: null, expectedClosingCash: null, closingNotes: null,
  createdById: 'admin', closedById: null, createdAt: new Date(), updatedAt: new Date(),
  seller: { userId: 'seller-user' }, employee: null, createdBy: { fullName: 'Boss' }, closedBy: null,
};

describe('WorkSessionsService', () => {
  let service: WorkSessionsService;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let perms: string[];

  beforeEach(async () => {
    perms = Object.values(PERMISSIONS);
    (computeFigures as jest.Mock).mockImplementation((_db, _t, sessions: { id: string }[]) =>
      Promise.resolve(new Map(sessions.map((s) => [s.id, figures()]))),
    );
    tx = {
      workSession: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => ({ id: 's1', ...data })), update: jest.fn() },
      cashHarvest: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => ({ id: 'h1', ...data })), update: jest.fn().mockImplementation(({ data }) => ({ id: 'h1', ...data })) },
      sessionAdjustment: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'a1', ...data })) },
      workSessionAudit: { create: jest.fn() },
    };
    prisma = {
      rolePermission: { findMany: jest.fn().mockImplementation(() => Promise.resolve(perms.map((key) => ({ permission: { key } })))) },
      workSession: {
        findFirst: jest.fn().mockResolvedValue({ ...baseSession }),
        findMany: jest.fn().mockResolvedValue([{ ...baseSession }]),
        count: jest.fn().mockResolvedValue(1),
      },
      sellerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'sp1', user: { fullName: 'Ali' } }), findMany: jest.fn().mockResolvedValue([]) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'e1', fullName: 'Emp' }), findMany: jest.fn().mockResolvedValue([]) },
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', name: 'Partner' }), findMany: jest.fn().mockResolvedValue([]) },
      cashHarvest: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [WorkSessionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(WorkSessionsService);
  });

  describe('start', () => {
    const dto = { role: 'SELLER' as const, personId: 'sp1', startedAt: new Date(Date.now() - 3600_000).toISOString(), openingCash: 500, harvestLimit: 1000 };

    it('creates an active session with a generated id SES-YYYY-0001 and an audit row', async () => {
      prisma.workSession.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ ...baseSession });
      await service.start('t1', 'admin', dto);
      const data = tx.workSession.create.mock.calls[0][0].data;
      expect(data.code).toMatch(/^SES-\d{4}-0001$/);
      expect(data.sellerProfileId).toBe('sp1');
      expect(data.personName).toBe('Ali');
      expect(data.openingCash.toString()).toBe('500');
      expect(tx.workSessionAudit.create.mock.calls[0][0].data.action).toBe('session.created');
    });

    it('the number continues after the last session of the year', async () => {
      prisma.workSession.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ ...baseSession });
      const year = new Date(dto.startedAt).getUTCFullYear();
      tx.workSession.findFirst.mockResolvedValue({ code: `SES-${year}-0007` });
      await service.start('t1', 'admin', dto);
      expect(tx.workSession.create.mock.calls[0][0].data.code).toBe(`SES-${year}-0008`);
    });

    it('a person who already has an active session cannot get a second one → 409', async () => {
      prisma.workSession.findFirst.mockResolvedValue({ code: 'SES-2026-0001' });
      await expect(service.start('t1', 'admin', dto)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.workSession.create).not.toHaveBeenCalled();
    });

    it('a start in the future → 422', async () => {
      await expect(
        service.start('t1', 'admin', { ...dto, startedAt: new Date(Date.now() + 86_400_000).toISOString() }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('unknown or inactive person → 404', async () => {
      prisma.sellerProfile.findFirst.mockResolvedValue(null);
      await expect(service.start('t1', 'admin', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('works for an employee and a partner too', async () => {
      prisma.workSession.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...baseSession })
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ ...baseSession });
      await service.start('t1', 'admin', { ...dto, role: 'EMPLOYEE', personId: 'e1' });
      expect(tx.workSession.create.mock.calls[0][0].data.employeeId).toBe('e1');
      await service.start('t1', 'admin', { ...dto, role: 'PARTNER', personId: 'p1' });
      expect(tx.workSession.create.mock.calls[1][0].data.partnerId).toBe('p1');
    });
  });

  describe('harvests', () => {
    it('within the limit → recorded and approved for a manager, with an audit row', async () => {
      const h = await service.createHarvest('t1', admin, 's1', { amount: 300 });
      expect(h.status).toBe('APPROVED');
      expect(h.number).toBe(1);
      expect(h.collectedById).toBe('admin');
      expect(tx.workSessionAudit.create.mock.calls[0][0].data.action).toBe('harvest.created');
    });

    it('above the remaining limit → 422 (a normal user cannot exceed it)', async () => {
      perms = perms.filter((p) => p !== PERMISSIONS.SESSIONS_OVERRIDE);
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures({ remainingHarvestLimit: D(200) })]]));
      await expect(service.createHarvest('t1', admin, 's1', { amount: 300 })).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(tx.cashHarvest.create).not.toHaveBeenCalled();
    });

    it('a user with the override permission may exceed the limit', async () => {
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures({ remainingHarvestLimit: D(200) })]]));
      const h = await service.createHarvest('t1', admin, 's1', { amount: 300 });
      expect(h.status).toBe('APPROVED');
    });

    it('more cash than the box holds → 422', async () => {
      perms = perms.filter((p) => p !== PERMISSIONS.SESSIONS_OVERRIDE);
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures({ expectedCash: D(100), remainingHarvestLimit: D(1000) })]]));
      await expect(service.createHarvest('t1', admin, 's1', { amount: 150 })).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('a non-cash harvest does not need cash in the box', async () => {
      perms = perms.filter((p) => p !== PERMISSIONS.SESSIONS_OVERRIDE);
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures({ expectedCash: D(0), remainingHarvestLimit: D(1000) })]]));
      const h = await service.createHarvest('t1', admin, 's1', { amount: 150, method: 'ZELLE' });
      expect(h.status).toBe('APPROVED');
    });

    it('the seller of the session can only request: the harvest is pending until a manager approves it', async () => {
      perms = [PERMISSIONS.SESSIONS_READ_OWN, PERMISSIONS.SESSIONS_REQUEST_HARVEST];
      const h = await service.createHarvest('t1', seller, 's1', { amount: 100 });
      expect(h.status).toBe('PENDING');
      expect(h.collectedById).toBeNull();
      expect(tx.workSessionAudit.create.mock.calls[0][0].data.action).toBe('harvest.requested');
    });

    it('a seller cannot request a harvest for somebody else\'s session', async () => {
      perms = [PERMISSIONS.SESSIONS_READ_OWN, PERMISSIONS.SESSIONS_REQUEST_HARVEST];
      prisma.workSession.findFirst.mockResolvedValue({ ...baseSession, seller: { userId: 'someone-else' } });
      await expect(service.createHarvest('t1', seller, 's1', { amount: 100 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a closed session cannot be harvested', async () => {
      prisma.workSession.findFirst.mockResolvedValue({ ...baseSession, status: 'CLOSED' });
      await expect(service.createHarvest('t1', admin, 's1', { amount: 10 })).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('a harvest before the session started → 422', async () => {
      await expect(
        service.createHarvest('t1', admin, 's1', { amount: 10, harvestedAt: '2026-08-01T00:00:00Z' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('approving a pending request records who collected it', async () => {
      prisma.cashHarvest.findFirst.mockResolvedValue({ id: 'h1', number: 3, status: 'PENDING', amount: D(100), method: 'CASH' });
      const h = await service.approveHarvest('t1', admin, 's1', 'h1');
      expect(h.status).toBe('APPROVED');
      expect(h.collectedById).toBe('admin');
      expect(tx.workSessionAudit.create.mock.calls[0][0].data.action).toBe('harvest.approved');
    });

    it('only a pending request can be approved or rejected', async () => {
      prisma.cashHarvest.findFirst.mockResolvedValue({ id: 'h1', number: 3, status: 'APPROVED', amount: D(100), method: 'CASH' });
      await expect(service.approveHarvest('t1', admin, 's1', 'h1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(service.rejectHarvest('t1', 'admin', 's1', 'h1', {})).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejecting keeps the row and audits the reason', async () => {
      prisma.cashHarvest.findFirst.mockResolvedValue({ id: 'h1', number: 3, status: 'PENDING', amount: D(100), method: 'CASH' });
      await service.rejectHarvest('t1', 'admin', 's1', 'h1', { reason: 'Too early' });
      expect(tx.cashHarvest.update.mock.calls[0][0].data.status).toBe('REJECTED');
      expect(tx.workSessionAudit.create.mock.calls[0][0].data.reason).toBe('Too early');
    });
  });

  describe('close', () => {
    it('stores the expected cash, the actual cash and the audit trail; the transactions are not touched', async () => {
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures({ expectedCash: D(1200) })]]));
      await service.close('t1', 'admin', 's1', { actualClosingCash: 1150, closingNotes: 'ok' });
      const update = tx.workSession.update.mock.calls[1][0].data;
      expect(update.actualClosingCash.toString()).toBe('1150');
      expect(update.expectedClosingCash.toString()).toBe('1200');
      const audit = tx.workSessionAudit.create.mock.calls[0][0].data;
      expect(audit.action).toBe('session.closed');
      expect(audit.newValue.result).toBe('SHORTAGE');
      expect(audit.newValue.difference).toBe('-50');
    });

    it('a matching count is Balanced, a higher one a Surplus', async () => {
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures({ expectedCash: D(1200) })]]));
      await service.close('t1', 'admin', 's1', { actualClosingCash: 1200 });
      expect(tx.workSessionAudit.create.mock.calls[0][0].data.newValue.result).toBe('BALANCED');
      await service.close('t1', 'admin', 's1', { actualClosingCash: 1300 });
      expect(tx.workSessionAudit.create.mock.calls[1][0].data.newValue.result).toBe('SURPLUS');
    });

    it('a closing time within the last minute means now, so fresh movements stay inside the session', async () => {
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures()]]));
      const almostNow = new Date(Date.now() - 45_000).toISOString();
      await service.close('t1', 'admin', 's1', { actualClosingCash: 500, closedAt: almostNow });
      const closedAt = tx.workSession.update.mock.calls[0][0].data.closedAt as Date;
      expect(Date.now() - closedAt.getTime()).toBeLessThan(5_000);
    });

    it('an earlier closing time is kept (movements after it are excluded from the session)', async () => {
      (computeFigures as jest.Mock).mockResolvedValue(new Map([['s1', figures()]]));
      const earlier = new Date(Date.now() - 3 * 3600_000);
      await service.close('t1', 'admin', 's1', { actualClosingCash: 500, closedAt: earlier.toISOString() });
      expect((tx.workSession.update.mock.calls[0][0].data.closedAt as Date).getTime()).toBe(earlier.getTime());
    });

    it('pending harvest requests must be decided first → 422', async () => {
      prisma.cashHarvest.count.mockResolvedValue(2);
      await expect(service.close('t1', 'admin', 's1', { actualClosingCash: 1 })).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(tx.workSession.update).not.toHaveBeenCalled();
    });

    it('an already closed session cannot be closed again, nor before it started', async () => {
      prisma.workSession.findFirst.mockResolvedValue({ ...baseSession, status: 'CLOSED' });
      await expect(service.close('t1', 'admin', 's1', { actualClosingCash: 1 })).rejects.toBeInstanceOf(UnprocessableEntityException);
      prisma.workSession.findFirst.mockResolvedValue({ ...baseSession });
      await expect(
        service.close('t1', 'admin', 's1', { actualClosingCash: 1, closedAt: '2026-01-01T00:00:00Z' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('adjustments and reopening', () => {
    it('an adjustment is a separate audited record with a reason', async () => {
      await service.adjust('t1', 'admin', 's1', { amount: -20, reason: 'Counting mistake' });
      expect(tx.sessionAdjustment.create.mock.calls[0][0].data.reason).toBe('Counting mistake');
      expect(tx.workSessionAudit.create.mock.calls[0][0].data.action).toBe('adjustment.created');
    });

    it('a zero adjustment is refused; a closed session must be reopened first', async () => {
      await expect(service.adjust('t1', 'admin', 's1', { amount: 0, reason: 'nothing' })).rejects.toThrow();
      prisma.workSession.findFirst.mockResolvedValue({ ...baseSession, status: 'CLOSED' });
      await expect(service.adjust('t1', 'admin', 's1', { amount: 5, reason: 'late fix' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('reopening clears the closing figures, keeps them in the audit trail, and needs a reason', async () => {
      prisma.workSession.findFirst
        .mockResolvedValueOnce({ ...baseSession, status: 'CLOSED', closedAt: new Date(), actualClosingCash: D(10), expectedClosingCash: D(12), closingNotes: 'n' })
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ ...baseSession });
      await service.reopen('t1', 'admin', 's1', { reason: 'Closed by mistake' });
      const data = tx.workSession.update.mock.calls[0][0].data;
      expect(data.status).toBe('ACTIVE');
      expect(data.actualClosingCash).toBeNull();
      const audit = tx.workSessionAudit.create.mock.calls[0][0].data;
      expect(audit.action).toBe('session.reopened');
      expect(audit.reason).toBe('Closed by mistake');
    });

    it('cannot reopen when the person already has another active session → 409', async () => {
      prisma.workSession.findFirst
        .mockResolvedValueOnce({ ...baseSession, status: 'CLOSED' })
        .mockResolvedValueOnce({ code: 'SES-2026-0009' });
      await expect(service.reopen('t1', 'admin', 's1', { reason: 'again' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('opening cash cannot be edited (not in the DTO); a harvest limit change is audited with old and new value', async () => {
      await service.update('t1', 'admin', 's1', { harvestLimit: 1500, reason: 'More trust' });
      expect(tx.workSession.update.mock.calls[0][0].data.openingCash).toBeUndefined();
      const audit = tx.workSessionAudit.create.mock.calls[0][0].data;
      expect(audit.action).toBe('session.updated');
      expect(audit.oldValue).toEqual({ harvestLimit: '1000' });
      expect(audit.newValue).toEqual({ harvestLimit: 1500 });
      expect(audit.reason).toBe('More trust');
    });

    it('nothing changed → no write', async () => {
      await service.update('t1', 'admin', 's1', { harvestLimit: 1000 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('visibility', () => {
    it('a seller with only read_own sees only their own sessions in the list', async () => {
      perms = [PERMISSIONS.SESSIONS_READ_OWN];
      await service.list('t1', seller, { page: 1, limit: 10 } as never);
      const where = prisma.workSession.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ seller: { userId: 'seller-user' } }, { employee: { userId: 'seller-user' } }]);
    });

    it('a manager with sessions.read sees all of them', async () => {
      await service.list('t1', admin, { page: 1, limit: 10 } as never);
      expect(prisma.workSession.findMany.mock.calls[0][0].where.OR).toBeUndefined();
    });

    it('no session permission at all → 403', async () => {
      perms = [];
      await expect(service.list('t1', seller, { page: 1, limit: 10 } as never)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("someone else's session is not found for a read_own user", async () => {
      perms = [PERMISSIONS.SESSIONS_READ_OWN];
      prisma.workSession.findFirst.mockResolvedValue({ ...baseSession, seller: { userId: 'other' } });
      await expect(service.get('t1', seller, 's1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('the session details carry the figures, the duration and, when closed, the result', async () => {
      prisma.workSession.findFirst.mockResolvedValue({
        ...baseSession, status: 'CLOSED', closedAt: new Date('2026-09-01T11:30:00Z'),
        actualClosingCash: D(490), expectedClosingCash: D(500),
      });
      const dto = await service.get('t1', admin, 's1');
      expect(dto.durationMinutes).toBe(150);
      expect(dto.difference?.toString()).toBe('-10');
      expect(dto.result).toBe('SHORTAGE');
      expect(dto.personId).toBe('sp1');
    });
  });
});
