import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('SuppliersService.createPurchase', () => {
  let service: SuppliersService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  const supplier = { id: 'sup1', tenantId: 't1', name: 'تأمین‌کننده ۱', deletedAt: null };
  const branch = {
    id: 'b1',
    tenantId: 't1',
    isActive: true,
    warehouses: [{ id: 'w1', isDefault: true, isActive: true }],
  };
  const products = [
    { id: 'p1', name: 'محصول ۱', purchasePrice: D(50) },
    { id: 'p2', name: 'محصول ۲', purchasePrice: D(30) },
  ];

  const baseDto = {
    supplierId: 'sup1',
    branchId: 'b1',
    paidAmount: 100,
    registerId: 'reg1',
    items: [
      { productId: 'p1', quantity: 2, unitCost: 60 },
      { productId: 'p2', quantity: 1, unitCost: 30 },
    ],
  };

  beforeEach(async () => {
    tx = {
      purchase: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'purch-1',
          purchaseNumber: data.purchaseNumber,
          ...data,
        })),
      },
      stock: {
        upsert: jest.fn().mockResolvedValue({ id: 's1', quantity: 5 }),
        update: jest.fn().mockResolvedValue({ id: 's1', quantity: 7 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockMovement: { create: jest.fn() },
      product: { update: jest.fn() },
      priceHistory: { create: jest.fn() },
      cashRegister: {
        // findFirst با where.id = بررسی recordCashTransaction روی صندوق واقعی؛ بدون id = جست‌وجوی صندوق قدرت خرید
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: { id?: string } }) =>
            Promise.resolve(where.id ? { balance: D(1000), isActive: true } : null),
          ),
        update: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
      debt: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'debt-1', ...data })) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ ...supplier }) },
      branch: { findFirst: jest.fn().mockResolvedValue({ ...branch }) },
      product: { findMany: jest.fn().mockResolvedValue(products.map((p) => ({ ...p }))) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SuppliersService);
  });

  it('خرید با پرداخت جزئی: ورود موجودی هر قلم + تغییر قیمت خرید + هزینه صندوق + بدهی باقیمانده', async () => {
    await service.createPurchase('t1', 'u1', baseDto);

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'PURCHASE_IN', quantity: 2 }),
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'PURCHASE_IN', quantity: 1 }),
      }),
    );

    // p1: unitCost 60 != purchasePrice 50 → به‌روزرسانی قیمت + تاریخچه؛ p2 بدون تغییر → یک بار صدا خورده
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { purchasePrice: D(60) } }),
    );
    expect(tx.priceHistory.create).toHaveBeenCalledTimes(1);
    const priceData = tx.priceHistory.create.mock.calls[0][0].data;
    expect(priceData.oldPrice.toString()).toBe('50');
    expect(priceData.newPrice.toString()).toBe('60');

    // مجموع خرید = 2*60 + 1*30 = 150، پرداخت 100 → هزینه صندوق 100 و بدهی باقیمانده 50
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.type).toBe('EXPENSE');
    expect(cashData.amount.toString()).toBe('100');
    const debtData = tx.debt.create.mock.calls[0][0].data;
    expect(debtData.amount.toString()).toBe('50');
    expect(debtData.direction).toBe('PAYABLE');
    expect(debtData.supplierId).toBe('sup1');
  });

  it('پرداخت کامل → بدون سند بدهی', async () => {
    await service.createPurchase('t1', 'u1', { ...baseDto, paidAmount: 150 });
    expect(tx.debt.create).not.toHaveBeenCalled();
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.amount.toString()).toBe('150');
  });

  it('بدون صندوق (registerId خالی) → بدون هزینه صندوق، بدهی کامل باقیمانده ثبت می‌شود', async () => {
    const { registerId: _registerId, ...dto } = baseDto;
    await service.createPurchase('t1', 'u1', dto);
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
    const debtData = tx.debt.create.mock.calls[0][0].data;
    expect(debtData.amount.toString()).toBe('50');
  });

  it('محصول تکراری در اقلام → 400 و بدون تراکنش', async () => {
    const dto = {
      ...baseDto,
      items: [
        { productId: 'p1', quantity: 1, unitCost: 50 },
        { productId: 'p1', quantity: 1, unitCost: 50 },
      ],
    };
    await expect(service.createPurchase('t1', 'u1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('محصول نامعتبر در اقلام → 400', async () => {
    prisma.product.findMany.mockResolvedValue([{ ...products[0] }]);
    await expect(service.createPurchase('t1', 'u1', baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('مبلغ پرداختی بیش از مجموع خرید → 422 و بدون تراکنش', async () => {
    await expect(
      service.createPurchase('t1', 'u1', { ...baseDto, paidAmount: 1000 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('شعبه بدون گدام پیش‌فرض فعال → 404', async () => {
    prisma.branch.findFirst.mockResolvedValue({ ...branch, warehouses: [] });
    await expect(service.createPurchase('t1', 'u1', baseDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
