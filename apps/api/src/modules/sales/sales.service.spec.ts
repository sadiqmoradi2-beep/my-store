import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { findIncomeRegister, recordCashTransaction } from '../cash/cash.service';
import { applyMovement } from '../inventory/inventory.service';
import { notifyLowStock } from '../notifications/notifications.service';
import { recordCommission } from '../sellers/sellers.service';
import { findActiveSessionIdForUser } from '../work-sessions/session-link';
import { SalesService } from './sales.service';

jest.mock('../cash/cash.service', () => ({ findIncomeRegister: jest.fn(), recordCashTransaction: jest.fn() }));
jest.mock('../work-sessions/session-link', () => ({ findActiveSessionIdForUser: jest.fn() }));
jest.mock('../inventory/inventory.service', () => ({ applyMovement: jest.fn() }));
jest.mock('../notifications/notifications.service', () => ({ notifyLowStock: jest.fn() }));
jest.mock('../sellers/sellers.service', () => ({ recordCommission: jest.fn() }));

const D = (v: number) => new Prisma.Decimal(v);

describe('SalesService.createFromCart', () => {
  let service: SalesService;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;

  const cart = {
    id: 'cart-1',
    tenantId: 't1',
    branchId: 'b1',
    items: [
      { productId: 'p1', quantity: 2, unitPrice: D(100), product: { name: 'Product 1', purchasePrice: D(60) } },
      { productId: 'p2', quantity: 1, unitPrice: D(250), product: { name: 'Product 2', purchasePrice: D(200) } },
    ],
  };
  // total 450, cost 320, profit 130

  beforeEach(async () => {
    jest.clearAllMocks();
    (findIncomeRegister as jest.Mock).mockResolvedValue({ id: 'reg-auto' });
    (findActiveSessionIdForUser as jest.Mock).mockResolvedValue(null);
    tx = {
      sale: {
        findFirst: jest.fn().mockResolvedValue({ saleNumber: 6 }),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'sale-1', ...data, items: [] })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: 'sale-1',
          saleNumber: 7,
          total: D(450),
          cost: D(320),
          branch: { name: 'Main' },
          createdBy: { fullName: 'Ali' },
          items: [],
          ...data,
        })),
      },
      cashRegister: { findFirst: jest.fn().mockResolvedValue({ id: 'reg-chosen' }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }), create: jest.fn().mockResolvedValue({ id: 'w-new' }) },
      cart: { delete: jest.fn() },
    };
    prisma = {
      cart: { findFirst: jest.fn().mockResolvedValue({ ...cart }) },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'b1', name: 'Main' }),
      },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [SalesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SalesService);
  });

  it('cash sale: sale saved with total/cost, stock deducted, money recorded in the Cash part, cart deleted', async () => {
    const result = await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH', cashReceived: 500 });

    const data = tx.sale.create.mock.calls[0][0].data;
    expect(data.saleNumber).toBe(7);
    expect(data.total.toString()).toBe('450');
    expect(data.cost.toString()).toBe('320');
    expect(data.paymentMethod).toBe('CASH');

    expect(applyMovement).toHaveBeenCalledTimes(2);
    expect(applyMovement).toHaveBeenCalledWith(tx, expect.objectContaining({ productId: 'p1', delta: -2, type: 'SALE_OUT', warehouseId: 'w1' }));
    expect(notifyLowStock).toHaveBeenCalled();

    expect(findIncomeRegister).toHaveBeenCalledWith(tx, 't1', 'b1', 'CASH');
    expect(recordCashTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ registerId: 'reg-auto', type: 'SALE', category: 'Cash' }),
    );
    expect((recordCashTransaction as jest.Mock).mock.calls[0][1].amount.toString()).toBe('450');
    expect(recordCommission).toHaveBeenCalledWith(tx, 't1', expect.objectContaining({ saleNumber: 7, createdById: 'u1' }));
    expect(tx.cart.delete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
    expect(result.change.toString()).toBe('50');
    expect(result.sale.profit.toString()).toBe('130');
  });

  it('fixed amount: the register receives the full amount paid (not just the sale total), no change given back', async () => {
    const result = await service.createFromCart('t1', 'u1', {
      cartId: 'cart-1',
      paymentMethod: 'CASH',
      cashReceived: 500,
      fixedAmount: true,
    });
    expect((recordCashTransaction as jest.Mock).mock.calls[0][1].amount.toString()).toBe('500');
    expect(result.change.toString()).toBe('0');
    expect(result.extraKept?.toString()).toBe('50');
    const data = tx.sale.create.mock.calls[0][0].data;
    expect(data.total.toString()).toBe('450'); // the sale's own total is unaffected — only the register amount changes
  });

  it('fixed amount without cashReceived → 422', async () => {
    await expect(
      service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH', fixedAmount: true }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fixed amount with cashReceived exactly equal to the total → no extra kept, note has no "+kept" suffix', async () => {
    const result = await service.createFromCart('t1', 'u1', {
      cartId: 'cart-1',
      paymentMethod: 'CASH',
      cashReceived: 450,
      fixedAmount: true,
    });
    expect(result.extraKept).toBeUndefined();
    expect((recordCashTransaction as jest.Mock).mock.calls[0][1].note).toBe('Sale #7');
  });

  it.each([
    ['EBT', 'EBT'],
    ['ZELLE', 'ZELLE'],
    ['CARD', 'CARD'], // Card has its own Income bucket
  ] as const)('%s payment → recorded in the %s Income part', async (method, part) => {
    await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: method });
    expect(findIncomeRegister).toHaveBeenCalledWith(tx, 't1', 'b1', part);
    expect(recordCashTransaction).toHaveBeenCalledTimes(1);
  });

  it('no change is returned for non-cash methods', async () => {
    const result = await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'EBT' });
    expect(result.change.toString()).toBe('0');
  });

  it('cash received less than the total → 422 and nothing is written', async () => {
    await expect(
      service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH', cashReceived: 400 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a chosen register must belong to the payment method\'s part', async () => {
    tx.cashRegister.findFirst.mockResolvedValue(null);
    await expect(
      service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'EBT', registerId: 'reg-cash' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.cashRegister.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'reg-cash', part: 'EBT' }) }),
    );
  });

  it('a chosen register of the right part is used', async () => {
    await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'EBT', registerId: 'reg-chosen' });
    expect(recordCashTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ registerId: 'reg-chosen' }));
    expect(findIncomeRegister).not.toHaveBeenCalled();
  });

  it('empty cart → 422', async () => {
    prisma.cart.findFirst.mockResolvedValue({ ...cart, items: [] });
    await expect(service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('unknown cart → 404', async () => {
    prisma.cart.findFirst.mockResolvedValue(null);
    await expect(service.createFromCart('t1', 'u1', { cartId: 'x', paymentMethod: 'CASH' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('a branch without a warehouse gets a default one created (a full reset deletes them)', async () => {
    tx.warehouse.findFirst.mockResolvedValue(null);
    await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH' });
    expect(tx.warehouse.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', branchId: 'b1', name: 'Main Warehouse', isDefault: true },
    });
    expect(applyMovement).toHaveBeenCalledWith(tx, expect.objectContaining({ warehouseId: 'w-new' }));
  });

  it('a sale by a seller with an active work session belongs to that session and its cash movement too', async () => {
    (findActiveSessionIdForUser as jest.Mock).mockResolvedValue('ses-1');
    await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH' });
    expect(tx.sale.create.mock.calls[0][0].data.sessionId).toBe('ses-1');
    expect(recordCashTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ sessionId: 'ses-1' }));
  });

  it('no active session → the sale belongs to none', async () => {
    await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH' });
    expect(tx.sale.create.mock.calls[0][0].data.sessionId).toBeNull();
  });

  it('DEBIT_CARD payment: recorded as immediate income in its own part, like EBT/Zelle', async () => {
    await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'DEBIT_CARD' });
    expect(findIncomeRegister).toHaveBeenCalledWith(tx, 't1', 'b1', 'DEBIT_CARD');
    expect(recordCashTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ registerId: 'reg-auto', type: 'SALE', category: 'Debit Card' }),
    );
    expect((recordCashTransaction as jest.Mock).mock.calls[0][1].amount.toString()).toBe('450');
  });

  it('DEBIT_CARD payment still records the commission and deletes the cart', async () => {
    await service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'DEBIT_CARD' });
    expect(recordCommission).toHaveBeenCalled();
    expect(tx.cart.delete).toHaveBeenCalled();
  });

  it('a stock shortage rejects the whole sale (error from applyMovement propagates)', async () => {
    (applyMovement as jest.Mock).mockRejectedValueOnce(new UnprocessableEntityException('Insufficient stock'));
    await expect(service.createFromCart('t1', 'u1', { cartId: 'cart-1', paymentMethod: 'CASH' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(recordCashTransaction).not.toHaveBeenCalled();
    expect(tx.cart.delete).not.toHaveBeenCalled();
  });
});

describe('SalesService.list', () => {
  it('applies method, branch and date filters (whole last day included)', async () => {
    const prisma = {
      sale: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [SalesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    await moduleRef.get(SalesService).list('t1', {
      page: 1,
      limit: 10,
      paymentMethod: 'EBT',
      branchId: 'b1',
      from: '2026-01-01',
      to: '2026-01-31',
    } as never);
    const where = prisma.sale.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.paymentMethod).toBe('EBT');
    expect(where.branchId).toBe('b1');
    expect(where.createdAt.gte.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(where.createdAt.lte.toISOString().slice(0, 10)).toBe('2026-01-31');
  });
});
