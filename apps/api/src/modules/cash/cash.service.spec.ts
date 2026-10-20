import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CashService, findIncomeRegister, recordCashTransaction } from './cash.service';

const D = (v: number) => new Prisma.Decimal(v);
const PEOPLE = {
  paidBy: { kind: 'EMPLOYEE' as const, id: 'emp1' },
  receivedBy: { kind: 'PERSON' as const, id: 'tp1' },
};

describe('CashService', () => {
  let service: CashService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]) as never,
      cashRegister: {
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'reg-1', ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'reg-1', branchId: 'b1' }]),
      },
      cashTransaction: { create: jest.fn() },
      workSession: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findFirst: jest.fn().mockResolvedValue({ fullName: 'Ahmad' }) },
      partner: { findFirst: jest.fn().mockResolvedValue({ name: 'Partner P' }) },
      teamPerson: { findFirst: jest.fn().mockResolvedValue({ id: 'tp1', displayName: 'Mohammad', user: null }), findUnique: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', tenantId: 't1', fullName: 'Admin', role: { key: 'ADMIN', isSystem: true, tenantId: null, rolePermissions: ['cash.transact'].map((key) => ({ permission: { key } })) } }) },
    };
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ settings: null }) },
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

  describe('createTransaction security and attribution', () => {
    beforeEach(() => tx.cashRegister.findFirst.mockResolvedValue({ balance: D(1000), isActive: true }));

    it('missing register returns 404 without starting a monetary transaction', async () => {
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      await expect(service.createTransaction('t1', 'u1', 'absent', { type: 'INCOME', amount: 5 })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(['INCOME', 'EXPENSE', 'WITHDRAWAL'] as const)('admin selects an actor independently of recipient for %s', async (type) => {
      await service.createTransaction('t1', 'u1', 'reg-1', { type, amount: 100, category: 'Rent', destination: type === 'INCOME' ? undefined : 'Supplier bank',
        personnel: { operation: type === 'INCOME' ? 'RECEIVE' : 'PAYMENT', personId: 'tp1' },
        ...(type === 'INCOME' ? { paidBy: PEOPLE.paidBy } : { receivedBy: PEOPLE.paidBy }),
      });
      expect(tx.cashTransaction.create).toHaveBeenCalledTimes(1);
      const data = tx.cashTransaction.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ performedById: 'u1', staffActorPersonId: 'tp1', staffActorName: 'Mohammad', category: 'Rent' });
      expect(data[type === 'INCOME' ? 'paidByEmployeeId' : 'receivedByEmployeeId']).toBe('emp1');
      expect(data.balanceAfter.toString()).toBe(type === 'INCOME' ? '1100' : '900');
    });

    it('does not require invented payers or recipients, on any payment method', async () => {
      for (const part of ['CASH', 'EBT', 'ZELLE', 'CARD']) {
        prisma.cashRegister.findFirst.mockResolvedValue({ id: 'reg-1', branchId: 'b1', part });
        await service.createTransaction('t1', 'u1', 'reg-1', { type: 'EXPENSE', amount: 5 });
      }
      expect(tx.cashTransaction.create).toHaveBeenCalledTimes(4);
    });

    it('rejects Employees or Partners submitted as staff and conflicting aliases', async () => {
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type: 'EXPENSE', amount: 5, paidBy: PEOPLE.paidBy })).rejects.toThrow('Staff actors');
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type: 'INCOME', amount: 5, receivedBy: { kind: 'PARTNER', id: 'partner' } })).rejects.toThrow('Staff actors');
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type: 'EXPENSE', amount: 5, paidBy: { kind: 'PERSON', id: 'other' }, personnel: { operation: 'PAYMENT', personId: 'tp1' } })).rejects.toThrow('Conflicting');
      expect(tx.cashTransaction.create).not.toHaveBeenCalled();
    });

    it.each(['INCOME', 'EXPENSE', 'WITHDRAWAL'] as const)('rejects spoofed direct API actor and legacy alias on %s before any balance write', async (type) => {
      const operator = await tx.user.findFirst(); operator.role.key = 'CASHIER';
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type, amount: 5, personnel: { operation: type === 'INCOME' ? 'RECEIVE' : 'PAYMENT', personId: 'forged' } })).rejects.toThrow('another financial actor');
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type, amount: 5, ...(type === 'INCOME' ? { receivedBy: { kind: 'PERSON' as const, id: 'forged' } } : { paidBy: { kind: 'PERSON' as const, id: 'forged' } }) })).rejects.toThrow('another financial actor');
      expect(tx.cashRegister.update).not.toHaveBeenCalled();
    });

    it('rejects role confusion and forged person kinds', async () => {
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type: 'EXPENSE', amount: 5, personnel: { operation: 'RECEIVE', personId: 'tp1' } })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type: 'EXPENSE', amount: 5, receivedBy: { kind: 'ADMIN' as never, id: 'tp1' } })).rejects.toThrow('invalid person kind');
    });

    it('past dates remain supported; future dates are rejected without money changes', async () => {
      await service.createTransaction('t1', 'u1', 'reg-1', { type: 'INCOME', amount: 5, date: '2025-03-15T12:00:00.000Z' });
      expect(tx.cashTransaction.create.mock.calls[0][0].data.createdAt).toEqual(new Date('2025-03-15T12:00:00.000Z'));
      await expect(service.createTransaction('t1', 'u1', 'reg-1', { type: 'INCOME', amount: 5, date: new Date(Date.now() + 3 * 86400000).toISOString() })).rejects.toBeInstanceOf(BadRequestException);
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

    it('internal transfers are neither income nor expense — reported apart', async () => {
      prisma.cashTransaction.groupBy.mockResolvedValue([
        { registerId: 'r-cash', type: 'INCOME', _sum: { amount: D(100) } },
        { registerId: 'r-cash', type: 'TRANSFER_OUT', _sum: { amount: D(60) } },
        { registerId: 'r-zelle', type: 'TRANSFER_IN', _sum: { amount: D(60) } },
      ]);
      const result = await service.incomeSummary('t1', {});
      const cash = result.parts.find((p) => p.part === 'CASH')!;
      const zelle = result.parts.find((p) => p.part === 'ZELLE')!;
      expect(cash.income.toString()).toBe('100');
      expect(cash.expenses.toString()).toBe('0');
      expect(cash.transfersOut.toString()).toBe('60');
      expect(zelle.income.toString()).toBe('0');
      expect(zelle.transfersIn.toString()).toBe('60');
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

  it('creates the register on first use with an insert that cannot duplicate it (ON CONFLICT … DO NOTHING)', async () => {
    const db = {
      cashRegister: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'new', part: 'ZELLE' }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const result = await findIncomeRegister(db as never, 't1', 'b1', 'ZELLE');
    expect(result.id).toBe('new');
    const sql = (db.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('ON CONFLICT ("tenantId", "branchId", "part") WHERE "isDefault" = true AND "isActive" = true DO NOTHING');
    expect(db.$executeRaw.mock.calls[0]).toEqual(expect.arrayContaining(['t1', 'b1', 'Zelle', 'ZELLE']));
  });
});

describe('recordCashTransaction', () => {
  function buildTx(register: { balance: Prisma.Decimal; isActive: boolean } | null) {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
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
