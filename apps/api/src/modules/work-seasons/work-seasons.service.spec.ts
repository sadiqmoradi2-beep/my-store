import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkSeasonsService } from './work-seasons.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('WorkSeasonsService.create', () => {
  let service: WorkSeasonsService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      workSeason: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'season1', ...data })),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [WorkSeasonsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(WorkSeasonsService);
  });

  it('دوره کاری باز موجود → 409 و بدون ایجاد', async () => {
    prisma.workSeason.findFirst.mockResolvedValue({ id: 'open1', status: 'OPEN' });
    await expect(service.create('t1', { name: 'بهار' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.workSeason.create).not.toHaveBeenCalled();
  });

  it('بدون دوره باز → ایجاد می‌شود', async () => {
    await service.create('t1', { name: 'بهار', openingCapital: 1000 });
    expect(prisma.workSeason.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 't1', name: 'بهار', openingCapital: D(1000) }),
      }),
    );
  });

  it('defaults currency=USDT and openingCash=0 when not sent', async () => {
    await service.create('t1', { name: 'بهار' });
    const data = prisma.workSeason.create.mock.calls[0][0].data;
    expect(data.currency).toBe('USDT');
    expect(data.openingCash.toString()).toBe('0');
  });

  it('currency و openingCash ارسالی ذخیره می‌شوند', async () => {
    await service.create('t1', { name: 'تابستان', currency: 'USDT', openingCash: 500 });
    const data = prisma.workSeason.create.mock.calls[0][0].data;
    expect(data.currency).toBe('USDT');
    expect(data.openingCash.toString()).toBe('500');
  });

  it('no openingCapital sent, no prior closed season → defaults to 0', async () => {
    await service.create('t1', { name: 'New season' });
    const data = prisma.workSeason.create.mock.calls[0][0].data;
    expect(data.openingCapital.toString()).toBe('0');
  });

  it('no openingCapital sent → carries forward the last closed season\'s remaining capital', async () => {
    prisma.workSeason.findFirst
      .mockResolvedValueOnce(null) // no open season
      .mockResolvedValueOnce({ id: 'closed1', openingCapital: D(1000) }); // last closed season
    prisma.capitalEntry = {
      groupBy: jest.fn().mockResolvedValue([
        { type: 'DEPOSIT', _sum: { amount: D(500) } },
        { type: 'WITHDRAWAL', _sum: { amount: D(200) } },
      ]),
    };
    await service.create('t1', { name: 'New season' });
    const data = prisma.workSeason.create.mock.calls[0][0].data;
    // 1000 opening + 500 in - 200 out = 1300 carried forward
    expect(data.openingCapital.toString()).toBe('1300');
  });

  it('openingCapital explicitly sent → carry-forward lookup is skipped entirely', async () => {
    await service.create('t1', { name: 'New season', openingCapital: 50 });
    expect(prisma.workSeason.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('WorkSeasonsService.close', () => {
  let service: WorkSeasonsService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  const openSeason = {
    id: 'season1',
    tenantId: 't1',
    status: 'OPEN' as const,
    startsAt: new Date('2026-01-01'),
    entries: [],
  };

  beforeEach(async () => {
    prisma = {
      workSeason: {
        findFirst: jest.fn().mockResolvedValue({ ...openSeason }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'season1', ...data })),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      cashTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      capitalEntry: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [WorkSeasonsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(WorkSeasonsService);
  });

  it('دوره قبلاً بسته‌شده → 422 و بدون محاسبه گزارش', async () => {
    prisma.workSeason.findFirst.mockResolvedValue({ ...openSeason, status: 'CLOSED' });
    await expect(service.close('t1', 'season1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('محاسبه گزارش پایان دوره: فروش، بهای تمام‌شده، سود و سرمایه', async () => {
    prisma.order.findMany.mockResolvedValue([
      { total: D(500), items: [{ quantity: 2, unitCost: D(100) }] },
      { total: D(300), items: [{ quantity: 1, unitCost: D(150) }] },
    ]);
    prisma.cashTransaction.aggregate.mockResolvedValue({ _sum: { amount: D(120) } });
    prisma.capitalEntry.groupBy.mockResolvedValue([
      { type: 'DEPOSIT', _sum: { amount: D(1000) } },
      { type: 'WITHDRAWAL', _sum: { amount: D(200) } },
    ]);

    await service.close('t1', 'season1');

    const data = prisma.workSeason.update.mock.calls[0][0].data;
    expect(data.status).toBe('CLOSED');
    expect(data.endsAt).toBeInstanceOf(Date);
    expect(data.closingReport).toEqual({
      salesTotal: '800',
      salesCost: '350',
      profit: '450',
      ordersCount: 2,
      expensesTotal: '120',
      capitalIn: '1000',
      capitalOut: '200',
    });
  });
});
