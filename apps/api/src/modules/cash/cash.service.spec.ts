import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CashService, findIncomeRegister, recordCashTransaction } from './cash.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('CashService', () => {
  let service: CashService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    tx = {
      cashRegister: {
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'reg-1', ...data })),
        findFirst: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
      workSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1' }]) },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue({ id: 'reg-1', tenantId: 't1', branchId: 'b1', part: 'CASH' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
      },
      cashTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
      sale: { groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CashService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CashService);
  });

  describe('getRegister', () => {
    it('register not found → 404', async () => {
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      await expect(service.getRegister('t1', 'reg-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createTransaction', () => {
    it('register not found → 404 and no database transaction is started', async () => {
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      await expect(
        service.createTransaction('t1', 'u1', 'reg-x', { type: 'INCOME', amount: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('delegates to recordCashTransaction with the correct parameters', async () => {
      tx.cashRegister.findFirst.mockResolvedValue({ balance: D(1000), isActive: true });
      await service.createTransaction('t1', 'u1', 'reg-1', {
        type: 'EXPENSE',
        amount: 100,
        category: 'Rent',
      });
      const data = tx.cashTransaction.create.mock.calls[0][0].data;
      expect(data.type).toBe('EXPENSE');
      expect(data.amount.toString()).toBe('100');
      expect(data.category).toBe('Rent');
      expect(data.performedById).toBe('u1');
      expect(data.tenantId).toBe('t1');
      expect(data.registerId).toBe('reg-1');
      expect(data.createdAt).toBeUndefined(); // no date → now (database default)
    });

    it('a past date back-fills the transaction on that day; a future date → 400', async () => {
      tx.cashRegister.findFirst.mockResolvedValue({ balance: D(1000), isActive: true });
      await service.createTransaction('t1', 'u1', 'reg-1', { type: 'INCOME', amount: 50, date: '2025-03-15T12:00:00.000Z' });
      expect(tx.cashTransaction.create.mock.calls[0][0].data.createdAt).toEqual(new Date('2025-03-15T12:00:00.000Z'));
      const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
      await expect(
        service.createTransaction('t1', 'u1', 'reg-1', { type: 'INCOME', amount: 50, date: future }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('incomeSummary', () => {
    const registers = [
      { id: 'r-cash', part: 'CASH', balance: D(1000) },
      { id: 'r-cash2', part: 'CASH', balance: D(500) },
      { id: 'r-ebt', part: 'EBT', balance: D(200) },
      { id: 'r-zelle', part: 'ZELLE', balance: D(300) },
    ];

    beforeEach(() => {
      prisma.cashRegister.findMany.mockResolvedValue(registers);
      prisma.cashTransaction.groupBy.mockResolvedValue([
        { registerId: 'r-cash', type: 'SALE', _sum: { amount: D(400) } },
        { registerId: 'r-cash2', type: 'INCOME', _sum: { amount: D(100) } },
        { registerId: 'r-cash', type: 'EXPENSE', _sum: { amount: D(150) } },
        { registerId: 'r-ebt', type: 'SALE', _sum: { amount: D(80) } },
        { registerId: 'r-zelle', type: 'SALE', _sum: { amount: D(120) } },
      ]);
      prisma.sale.groupBy.mockResolvedValue([
        { paymentMethod: 'CASH', _sum: { total: D(400), cost: D(300) }, _count: { _all: 4 } },
        { paymentMethod: 'EBT', _sum: { total: D(80), cost: D(50) }, _count: { _all: 1 } },
        { paymentMethod: 'ZELLE', _sum: { total: D(70), cost: D(40) }, _count: { _all: 1 } },
        { paymentMethod: 'CARD', _sum: { total: D(50), cost: D(30) }, _count: { _all: 2 } },
        { paymentMethod: 'DEBIT_CARD', _sum: { total: D(90), cost: D(60) }, _count: { _all: 1 } },
      ]);
    });

    it('sums balances, money in and money out per part (several registers of a part are merged)', async () => {
      const result = await service.incomeSummary('t1', {});
      const cash = result.parts.find((p) => p.part === 'CASH')!;
      expect(cash.balance.toString()).toBe('1500');
      expect(cash.income.toString()).toBe('500'); // 400 sale + 100 income
      expect(cash.expenses.toString()).toBe('150');
    });

    it('Card gets its own Income part, separate from Zelle', async () => {
      const result = await service.incomeSummary('t1', {});
      const card = result.parts.find((p) => p.part === 'CARD')!;
      expect(card.profit.toString()).toBe('20'); // 50 - 30
      expect(card.salesCount).toBe(2);
      const zelle = result.parts.find((p) => p.part === 'ZELLE')!;
      expect(zelle.profit.toString()).toBe('30'); // 70 - 40
      expect(zelle.salesCount).toBe(1);
    });

    it('Debit Card gets its own Income part, separate from Zelle/Card', async () => {
      const result = await service.incomeSummary('t1', {});
      const debitCard = result.parts.find((p) => p.part === 'DEBIT_CARD')!;
      expect(debitCard.profit.toString()).toBe('30'); // 90 - 60
      expect(debitCard.salesCount).toBe(1);
      const zelle = result.parts.find((p) => p.part === 'ZELLE')!;
      expect(zelle.salesCount).toBe(1); // unaffected by the Debit Card sale
    });

    it('total sales, profit and count cover every payment method', async () => {
      const result = await service.incomeSummary('t1', {});
      expect(result.totals.totalSales.toString()).toBe('690'); // 600 + 90 debit card
      expect(result.totals.totalProfit.toString()).toBe('210'); // 180 + (90-60)
      expect(result.totals.salesCount).toBe(9);
    });

    it('total income is the sum of the Cash, EBT and Zelle incomes', async () => {
      const result = await service.incomeSummary('t1', {});
      expect(result.totals.totalIncome.toString()).toBe('700'); // 500 + 80 + 120
      expect(result.totals.totalBalance.toString()).toBe('2000');
    });

    it('a branch filter is passed to registers and sales', async () => {
      await service.incomeSummary('t1', { branchId: 'b2' });
      expect(prisma.cashRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ branchId: 'b2' }) }),
      );
      expect(prisma.sale.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ branchId: 'b2' }) }),
      );
    });
  });
});

describe('findIncomeRegister', () => {
  it('returns the existing register of the part', async () => {
    const db = { cashRegister: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }), create: jest.fn() } };
    const result = await findIncomeRegister(db as never, 't1', 'b1', 'EBT');
    expect(result.id).toBe('r1');
    expect(db.cashRegister.create).not.toHaveBeenCalled();
    expect(db.cashRegister.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', branchId: 'b1', part: 'EBT', isActive: true } }),
    );
  });

  it('creates the register on first use, named after the part', async () => {
    const db = {
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
      },
    };
    await findIncomeRegister(db as never, 't1', 'b1', 'ZELLE');
    expect(db.cashRegister.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', branchId: 'b1', part: 'ZELLE', name: 'Zelle', isDefault: true },
    });
  });
});

describe('recordCashTransaction', () => {
  function buildTx(register: { balance: Prisma.Decimal; isActive: boolean } | null) {
    return {
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue(register),
        update: jest.fn(),
      },
      cashTransaction: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'ct1', ...data })),
      },
    };
  }

  it('register belonging to another tenant (or nonexistent) → 404 with no balance change — findFirst must filter by tenantId', async () => {
    const tx = buildTx(null);
    await expect(
      recordCashTransaction(tx as never, {
        tenantId: 't1',
        userId: 'u1',
        registerId: 'reg-of-other-tenant',
        type: 'REFUND',
        amount: D(100),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.cashRegister.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'reg-of-other-tenant', tenantId: 't1' } }),
    );
    expect(tx.cashRegister.update).not.toHaveBeenCalled();
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('inactive register → rejected with no balance change', async () => {
    const tx = buildTx({ balance: D(1000), isActive: false });
    await expect(
      recordCashTransaction(tx as never, {
        tenantId: 't1',
        userId: 'u1',
        registerId: 'reg-1',
        type: 'INCOME',
        amount: D(100),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.cashRegister.update).not.toHaveBeenCalled();
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('SALE: balance increases', async () => {
    const tx = buildTx({ balance: D(1000), isActive: true });
    await recordCashTransaction(tx as never, {
      tenantId: 't1',
      userId: 'u1',
      registerId: 'reg-1',
      type: 'SALE',
      amount: D(500),
    });
    expect(tx.cashRegister.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { balance: D(1500) },
    });
    const data = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(data.balanceAfter.toString()).toBe('1500');
  });

  it('EXPENSE/REFUND/WITHDRAWAL: balance decreases', async () => {
    const tx = buildTx({ balance: D(1000), isActive: true });
    await recordCashTransaction(tx as never, {
      tenantId: 't1',
      userId: 'u1',
      registerId: 'reg-1',
      type: 'EXPENSE',
      amount: D(300),
    });
    const data = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(data.balanceAfter.toString()).toBe('700');
  });

  it('negative amount → rejected before any write (would flip direction and credit instead of debit)', async () => {
    const tx = buildTx({ balance: D(100), isActive: true });
    await expect(
      recordCashTransaction(tx as never, {
        tenantId: 't1',
        userId: 'u1',
        registerId: 'reg-1',
        type: 'WITHDRAWAL',
        amount: D(-5000),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.cashRegister.findFirst).not.toHaveBeenCalled();
    expect(tx.cashRegister.update).not.toHaveBeenCalled();
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('balance would go negative → transaction rejected with no writes at all', async () => {
    const tx = buildTx({ balance: D(100), isActive: true });
    await expect(
      recordCashTransaction(tx as never, {
        tenantId: 't1',
        userId: 'u1',
        registerId: 'reg-1',
        type: 'WITHDRAWAL',
        amount: D(200),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.cashRegister.update).not.toHaveBeenCalled();
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('balance becomes exactly zero → allowed (not negative)', async () => {
    const tx = buildTx({ balance: D(200), isActive: true });
    await recordCashTransaction(tx as never, {
      tenantId: 't1',
      userId: 'u1',
      registerId: 'reg-1',
      type: 'WITHDRAWAL',
      amount: D(200),
    });
    expect(tx.cashRegister.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { balance: D(0) },
    });
  });

  it('reference and category/note are stored on the record', async () => {
    const tx = buildTx({ balance: D(1000), isActive: true });
    await recordCashTransaction(tx as never, {
      tenantId: 't1',
      userId: 'u1',
      registerId: 'reg-1',
      type: 'REFUND',
      amount: D(50),
      referenceType: 'ORDER',
      referenceId: 'order-1',
      note: 'Note',
    });
    expect(tx.cashTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: 'ORDER',
          referenceId: 'order-1',
          note: 'Note',
          performedById: 'u1',
        }),
      }),
    );
  });
});
