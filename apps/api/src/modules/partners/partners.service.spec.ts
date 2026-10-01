import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnersService } from './partners.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('PartnersService.list', () => {
  let service: PartnersService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      partner: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', name: 'Partner 1', isActive: true },
          { id: 'p2', name: 'Partner 2', isActive: true },
        ]),
      },
      partnerLedgerEntry: {
        groupBy: jest.fn().mockResolvedValue([
          { partnerId: 'p1', type: 'PROFIT', _sum: { amount: D(1000) } },
          { partnerId: 'p1', type: 'WITHDRAWAL', _sum: { amount: D(300) } },
          { partnerId: 'p2', type: 'LOSS', _sum: { amount: D(200) } },
        ]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PartnersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PartnersService);
  });

  it('computes balance as profit minus loss minus withdrawal plus adjustment', async () => {
    const result = await service.list('t1');
    const p1 = result.find((p) => p.id === 'p1')!;
    expect(p1.balance.toString()).toBe('700');
    expect(p1.totalProfit.toString()).toBe('1000');
    expect(p1.totalWithdrawn.toString()).toBe('300');

    const p2 = result.find((p) => p.id === 'p2')!;
    expect(p2.balance.toString()).toBe('-200');
    expect(p2.totalLoss.toString()).toBe('200');
  });
});

describe('PartnersService.remove', () => {
  let service: PartnersService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      partner: { findFirst: jest.fn(), update: jest.fn() },
      partnerLedgerEntry: { count: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PartnersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PartnersService);
  });

  it('partner not found → 404', async () => {
    prisma.partner.findFirst.mockResolvedValue(null);
    await expect(service.remove('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('partner with ledger entries → 422 and no soft-delete', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.partnerLedgerEntry.count.mockResolvedValue(3);
    await expect(service.remove('t1', 'p1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.partner.update).not.toHaveBeenCalled();
  });

  it('partner with no ledger entries → soft-deleted', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.partnerLedgerEntry.count.mockResolvedValue(0);
    await service.remove('t1', 'p1');
    expect(prisma.partner.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe('PartnersService.addLedgerEntry', () => {
  let service: PartnersService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    tx = {
      partnerLedgerEntry: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'entry1', ...data })),
      },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue({ balance: D(1000), isActive: true }),
        update: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
      workSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', name: 'Partner 1' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PartnersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PartnersService);
  });

  it('WITHDRAWAL with a registerId → records an EXPENSE cash transaction', async () => {
    await service.addLedgerEntry('t1', 'u1', 'p1', {
      type: 'WITHDRAWAL',
      amount: 200,
      registerId: 'reg1',
    });
    expect(tx.cashTransaction.create).toHaveBeenCalledTimes(1);
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.type).toBe('EXPENSE');
    expect(cashData.amount.toString()).toBe('200');
  });

  it('WITHDRAWAL without a registerId → no cash effect', async () => {
    await service.addLedgerEntry('t1', 'u1', 'p1', { type: 'WITHDRAWAL', amount: 200 });
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('PROFIT entry with a registerId ignored → no cash effect (only WITHDRAWAL touches cash)', async () => {
    await service.addLedgerEntry('t1', 'u1', 'p1', {
      type: 'PROFIT',
      amount: 500,
      registerId: 'reg1',
    });
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('receiptUrl is stored on the ledger entry', async () => {
    await service.addLedgerEntry('t1', 'u1', 'p1', {
      type: 'WITHDRAWAL',
      amount: 200,
      registerId: 'reg1',
      receiptUrl: '/uploads/cash-receipts/t1/x.jpg',
    });
    expect(tx.partnerLedgerEntry.create.mock.calls[0][0].data.receiptUrl).toBe(
      '/uploads/cash-receipts/t1/x.jpg',
    );
  });
});

describe('PartnersService.previewDistribution / distribute', () => {
  let service: PartnersService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    tx = {
      partnerLedgerEntry: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'e1', ...data })) },
    };
    prisma = {
      partner: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', name: 'Partner 1', sharePercent: D(60) },
          { id: 'p2', name: 'Partner 2', sharePercent: D(40) },
        ]),
      },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PartnersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PartnersService);
  });

  it('splits the total proportionally to each partner sharePercent', async () => {
    const preview = await service.previewDistribution('t1', { totalAmount: 1000, type: 'PROFIT' });
    expect(preview).toHaveLength(2);
    expect(preview[0].amount.toString()).toBe('600');
    expect(preview[1].amount.toString()).toBe('400');
  });

  it('no active partners with a share → 422 on distribute', async () => {
    prisma.partner.findMany.mockResolvedValue([]);
    await expect(
      service.distribute('t1', 'u1', { totalAmount: 1000, type: 'PROFIT' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('distribute creates one ledger entry per partner with the previewed amount', async () => {
    await service.distribute('t1', 'u1', { totalAmount: 1000, type: 'LOSS', period: '2026-09' });
    expect(tx.partnerLedgerEntry.create).toHaveBeenCalledTimes(2);
    const first = tx.partnerLedgerEntry.create.mock.calls[0][0].data;
    expect(first.type).toBe('LOSS');
    expect(first.amount.toString()).toBe('600');
    expect(first.period).toBe('2026-09');
  });
});
