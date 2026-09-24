import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { accrueNetProfit, CashService, recordCashTransaction, reverseNetProfitForReturn } from './cash.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('CashService', () => {
  let service: CashService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    tx = {
      cashRegister: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'reg-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'reg-1', ...data })),
        findFirst: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
    };
    prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue({ id: 'reg-1', tenantId: 't1', branchId: 'b1' }),
      },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CashService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CashService);
  });

  describe('createRegister', () => {
    it('branch not found → 404', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(
        service.createRegister('t1', { branchId: 'b1', name: 'Register 1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('first register of a branch → automatically default', async () => {
      tx.cashRegister.count.mockResolvedValue(0);
      await service.createRegister('t1', { branchId: 'b1', name: 'Register 1' });
      const data = tx.cashRegister.create.mock.calls[0][0].data;
      expect(data.isDefault).toBe(true);
      expect(tx.cashRegister.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { branchId: 'b1', isDefault: true } }),
      );
    });

    it('second register without explicit isDefault → not default, and other registers remain untouched', async () => {
      tx.cashRegister.count.mockResolvedValue(1);
      await service.createRegister('t1', { branchId: 'b1', name: 'Register 2' });
      const data = tx.cashRegister.create.mock.calls[0][0].data;
      expect(data.isDefault).toBe(false);
      expect(tx.cashRegister.updateMany).not.toHaveBeenCalled();
    });

    it('explicit isDefault=true → other registers in the same branch become non-default', async () => {
      tx.cashRegister.count.mockResolvedValue(1);
      await service.createRegister('t1', { branchId: 'b1', name: 'Register 2', isDefault: true });
      expect(tx.cashRegister.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: 'b1', isDefault: true },
          data: { isDefault: false },
        }),
      );
    });

    it('openingBalance not specified → initial balance is zero', async () => {
      await service.createRegister('t1', { branchId: 'b1', name: 'Register 1' });
      const data = tx.cashRegister.create.mock.calls[0][0].data;
      expect(data.balance.toString()).toBe('0');
      expect(data.openingBalance.toString()).toBe('0');
    });

    it('isNetProfitBox=true + isDefault=true → 422 (cannot be default at the same time)', async () => {
      await expect(
        service.createRegister('t1', {
          branchId: 'b1',
          name: 'Net Profit',
          isNetProfitBox: true,
          isDefault: true,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('first/only register of a branch with isNetProfitBox=true → not automatically default', async () => {
      tx.cashRegister.count.mockResolvedValue(0);
      await service.createRegister('t1', {
        branchId: 'b1',
        name: 'Net Profit',
        isNetProfitBox: true,
      });
      const data = tx.cashRegister.create.mock.calls[0][0].data;
      expect(data.isDefault).toBe(false);
    });
  });

  describe('updateRegister', () => {
    it('register not found → 404', async () => {
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      await expect(service.updateRegister('t1', 'reg-x', { name: 'New' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('isDefault=true → other registers in the same branch become non-default', async () => {
      await service.updateRegister('t1', 'reg-1', { isDefault: true });
      expect(tx.cashRegister.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: 'b1', isDefault: true, NOT: { id: 'reg-1' } },
        }),
      );
      expect(tx.cashRegister.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: { isDefault: true },
      });
    });

    it('without isDefault → other registers are unchanged', async () => {
      await service.updateRegister('t1', 'reg-1', { name: 'New Name' });
      expect(tx.cashRegister.updateMany).not.toHaveBeenCalled();
    });

    it('isNetProfitBox=true on the current default register → 422', async () => {
      prisma.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
        tenantId: 't1',
        branchId: 'b1',
        isDefault: true,
        isNetProfitBox: false,
      });
      await expect(
        service.updateRegister('t1', 'reg-1', { isNetProfitBox: true }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('isDefault=false on the current default register with no replacement → 422', async () => {
      prisma.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
        tenantId: 't1',
        branchId: 'b1',
        isDefault: true,
        isNetProfitBox: false,
      });
      await expect(
        service.updateRegister('t1', 'reg-1', { isDefault: false }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(tx.cashRegister.update).not.toHaveBeenCalled();
    });
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

describe('accrueNetProfit', () => {
  function buildTx(register: { id: string } | null) {
    return {
      cashRegister: {
        // findFirst with select:{id} = looks up the net profit register; with select:{balance,isActive} = checks recordCashTransaction
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: { id?: string } }) =>
            Promise.resolve(where.id ? { balance: D(1000), isActive: true } : register),
          ),
        update: jest.fn(),
      },
      cashTransaction: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'ct1', ...data })),
      },
    };
  }

  it('no active net profit register → no transaction', async () => {
    const tx = buildTx(null);
    const result = await accrueNetProfit(tx as never, 't1', 'u1', {
      id: 'order-1',
      branchId: 'b1',
      total: D(2000),
      items: [{ quantity: 1, unitCost: D(1800) }],
    });
    expect(result).toBeNull();
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('with an active register → the full profit is recorded as INCOME', async () => {
    const tx = buildTx({ id: 'reg-np' });
    await accrueNetProfit(tx as never, 't1', 'u1', {
      id: 'order-1',
      branchId: 'b1',
      total: D(2000),
      items: [{ quantity: 1, unitCost: D(1800) }],
    });
    const data = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('INCOME');
    expect(data.amount.toString()).toBe('200');
    expect(data.registerId).toBe('reg-np');
    expect(data.referenceId).toBe('order-1');
  });

  it('zero or negative profit → no transaction', async () => {
    const tx = buildTx({ id: 'reg-np' });
    const result = await accrueNetProfit(tx as never, 't1', 'u1', {
      id: 'order-1',
      branchId: 'b1',
      total: D(1000),
      items: [{ quantity: 1, unitCost: D(1200) }],
    });
    expect(result).toBeNull();
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });
});

describe('reverseNetProfitForReturn', () => {
  function buildTx(register: { id: string } | null) {
    return {
      cashRegister: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: { id?: string } }) =>
            Promise.resolve(where.id ? { balance: D(1000), isActive: true } : register),
          ),
        update: jest.fn(),
      },
      cashTransaction: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'ct1', ...data })),
      },
    };
  }

  it('with an active register → the returned profit share is deducted as EXPENSE', async () => {
    const tx = buildTx({ id: 'reg-np' });
    await reverseNetProfitForReturn(tx as never, {
      tenantId: 't1',
      userId: 'u1',
      orderId: 'order-1',
      branchId: 'b1',
      returnedCost: D(80),
      returnedRevenue: D(100),
    });
    const data = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(data.type).toBe('EXPENSE');
    expect(data.amount.toString()).toBe('20');
    expect(data.registerId).toBe('reg-np');
  });

  it('no net profit register → no transaction', async () => {
    const tx = buildTx(null);
    const result = await reverseNetProfitForReturn(tx as never, {
      tenantId: 't1',
      userId: 'u1',
      orderId: 'order-1',
      branchId: 'b1',
      returnedCost: D(80),
      returnedRevenue: D(100),
    });
    expect(result).toBeNull();
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
  });
});
