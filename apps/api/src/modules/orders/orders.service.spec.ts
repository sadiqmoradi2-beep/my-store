import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { canTransition } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const D = (v: number) => new Prisma.Decimal(v);

type RepoMock = jest.Mocked<
  Pick<
    OrdersRepository,
    | 'findById'
    | 'findBranchWithDefaultWarehouse'
    | 'findProductsForOrder'
  >
>;

describe('Order state machine (shared)', () => {
  it('allowed transitions', () => {
    expect(canTransition('PENDING', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('APPROVED', 'DELIVERED')).toBe(true);
    expect(canTransition('APPROVED', 'CANCELLED')).toBe(true);
  });

  it('disallowed transitions', () => {
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
    expect(canTransition('DELIVERED', 'PENDING')).toBe(false);
    expect(canTransition('CANCELLED', 'APPROVED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
  });
});

function buildTx() {
  return {
    stock: {
      upsert: jest.fn().mockResolvedValue({ id: 's1', quantity: 10 }),
      update: jest.fn().mockResolvedValue({ id: 's1', quantity: 7 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    stockMovement: { create: jest.fn() },
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'order-1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'order-1', ...data })),
    },
    orderStatusHistory: { create: jest.fn() },
    cashRegister: { findFirst: jest.fn().mockResolvedValue(null) },
    sellerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    commissionEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn() },
  };
}

async function buildService(tx: ReturnType<typeof buildTx>, repo: RepoMock) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      OrdersService,
      { provide: OrdersRepository, useValue: repo },
      {
        provide: PrismaService,
        useValue: { $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) },
      },
    ],
  }).compile();
  return moduleRef.get(OrdersService);
}

function buildRepo(): RepoMock {
  return {
    findById: jest.fn(),
    findBranchWithDefaultWarehouse: jest
      .fn()
      .mockResolvedValue({ id: 'b1', warehouses: [{ id: 'w1' }] }),
    findProductsForOrder: jest.fn().mockResolvedValue([
      { id: 'p1', name: 'Product 1', salePrice: D(100), purchasePrice: D(70) },
    ]),
  } as never;
}

describe('OrdersService.create', () => {
  let service: OrdersService;
  let repo: RepoMock;
  let tx: ReturnType<typeof buildTx>;

  beforeEach(async () => {
    tx = buildTx();
    repo = buildRepo();
    service = await buildService(tx, repo);
  });

  it('creates the order with subtotal and total from item prices', async () => {
    await service.create('t1', 'u1', {
      branchId: 'b1',
      items: [{ productId: 'p1', quantity: 3 }],
    });
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.subtotal.toString()).toBe('300');
    expect(data.total.toString()).toBe('300');
  });

});

describe('OrdersService.transition', () => {
  let service: OrdersService;
  let repo: RepoMock;
  let tx: ReturnType<typeof buildTx>;

  const order = {
    id: 'order-1',
    tenantId: 't1',
    branchId: 'b1',
    status: 'PENDING',
    createdById: 'u-seller',
    orderNumber: 1,
    total: D(300),
    items: [{ productId: 'p1', quantity: 3, unitPrice: D(100), unitCost: D(70) }],
  };

  beforeEach(async () => {
    tx = buildTx();
    repo = buildRepo();
    repo.findById.mockResolvedValue({ ...order } as never);
    service = await buildService(tx, repo);
  });

  it('disallowed transition → 422 and no side effects', async () => {
    await expect(
      service.transition('t1', 'u1', 'order-1', { toStatus: 'DELIVERED' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.stock.update).not.toHaveBeenCalled();
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('Approve deducts stock and records history', async () => {
    await service.transition('t1', 'u1', 'order-1', { toStatus: 'APPROVED' });
    expect(tx.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 7 } }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SALE_OUT', quantity: 3 }) }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 'u1' }),
      }),
    );
    expect(tx.orderStatusHistory.create).toHaveBeenCalled();
  });

  it('Approve with insufficient stock → 422', async () => {
    tx.stock.upsert.mockResolvedValue({ id: 's1', quantity: 2 });
    await expect(
      service.transition('t1', 'u1', 'order-1', { toStatus: 'APPROVED' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.stock.update).not.toHaveBeenCalled();
  });

  it('cancel after approval restores stock (RETURN_IN)', async () => {
    repo.findById.mockResolvedValue({ ...order, status: 'APPROVED' } as never);
    await service.transition('t1', 'u1', 'order-1', { toStatus: 'CANCELLED' });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RETURN_IN' }) }),
    );
  });

  it('cancel before approval has no stock effect', async () => {
    await service.transition('t1', 'u1', 'order-1', { toStatus: 'CANCELLED' });
    expect(tx.stock.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('delivery: records commission for the creating seller', async () => {
    repo.findById.mockResolvedValue({ ...order, status: 'APPROVED' } as never);
    tx.sellerProfile.findFirst.mockResolvedValue({ id: 'sp1', commissionPercent: D(5) });
    await service.transition('t1', 'u1', 'order-1', { toStatus: 'DELIVERED' });
    // 5% of 300 = 15
    const data = tx.commissionEntry.create.mock.calls[0][0].data;
    expect(data.sellerProfileId).toBe('sp1');
    expect(data.amount.toString()).toBe('15');
    expect(data.orderNumber).toBe(1);
  });

  it('delivery without a seller profile: no commission', async () => {
    repo.findById.mockResolvedValue({ ...order, status: 'APPROVED' } as never);
    await service.transition('t1', 'u1', 'order-1', { toStatus: 'DELIVERED' });
    expect(tx.commissionEntry.create).not.toHaveBeenCalled();
  });
});
