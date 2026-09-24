import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

describe('InventoryService.transfer', () => {
  let service: InventoryService;
  let tx: Record<string, Record<string, jest.Mock>>;
  const quantities: Record<string, number> = {};

  beforeEach(async () => {
    quantities.w1 = 10;
    quantities.w2 = 0;
    tx = {
      stock: {
        upsert: jest.fn().mockImplementation(({ where }) => ({
          id: `s-${where.productId_warehouseId.warehouseId}`,
          quantity: quantities[where.productId_warehouseId.warehouseId],
        })),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const warehouseId = (where.id as string).replace('s-', '');
          quantities[warehouseId] = data.quantity;
          return { id: where.id, quantity: data.quantity };
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockMovement: { create: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repo = {
      findProduct: jest.fn().mockResolvedValue({ id: 'p1' }),
      findWarehouse: jest.fn().mockResolvedValue({ id: 'w' }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: InventoryRepository, useValue: repo },
        {
          provide: PrismaService,
          useValue: { $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) },
        },
      ],
    }).compile();
    service = moduleRef.get(InventoryService);
  });

  it('انتقال، مبدأ را کم و مقصد را زیاد می‌کند با transferId مشترک', async () => {
    await service.transfer('t1', 'u1', {
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 4,
    });
    expect(quantities.w1).toBe(6);
    expect(quantities.w2).toBe(4);

    const calls = tx.stockMovement.create.mock.calls.map(([arg]) => arg.data);
    expect(calls).toHaveLength(2);
    expect(calls[0].type).toBe('TRANSFER_OUT');
    expect(calls[1].type).toBe('TRANSFER_IN');
    expect(calls[0].transferId).toBeDefined();
    expect(calls[0].transferId).toBe(calls[1].transferId);
  });

  it('انتقال بیش از موجودی → 422 و بدون حرکت', async () => {
    await expect(
      service.transfer('t1', 'u1', {
        productId: 'p1',
        fromWarehouseId: 'w1',
        toWarehouseId: 'w2',
        quantity: 11,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('انتقال به همان گدام → 400', async () => {
    await expect(
      service.transfer('t1', 'u1', {
        productId: 'p1',
        fromWarehouseId: 'w1',
        toWarehouseId: 'w1',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('درخواست از گدام: بیل رسید روی هر دو حرکت (خروج/ورود) ثبت می‌شود', async () => {
    await service.transfer('t1', 'u1', {
      productId: 'p1',
      fromWarehouseId: 'w1',
      toWarehouseId: 'w2',
      quantity: 2,
      receiptImageUrl: '/uploads/warehouse-requests/t1/receipt.jpg',
    });
    const calls = tx.stockMovement.create.mock.calls.map(([arg]) => arg.data);
    expect(calls[0].receiptImageUrl).toBe('/uploads/warehouse-requests/t1/receipt.jpg');
    expect(calls[1].receiptImageUrl).toBe('/uploads/warehouse-requests/t1/receipt.jpg');
  });
});
