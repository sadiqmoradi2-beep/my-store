import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PurchaseReturnsService } from './purchase-returns.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('PurchaseReturnsService.create', () => {
  let service: PurchaseReturnsService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  const dto = { supplierId: 's1', productId: 'p1', warehouseId: 'w1', quantity: 4, note: 'Expired' };

  beforeEach(async () => {
    tx = {
      purchaseReturn: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'pr1', ...data })) },
      stock: {
        upsert: jest.fn().mockResolvedValue({ id: 'st1', quantity: 10 }),
        update: jest.fn().mockResolvedValue({ id: 'st1', quantity: 6 }),
      },
      stockMovement: { create: jest.fn() },
      debt: { create: jest.fn() },
    };
    prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 's1', name: 'Acme' }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', name: 'Milk', purchasePrice: D(5) }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PurchaseReturnsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PurchaseReturnsService);
  });

  it('removes stock as RETURN_OUT and records a receivable from the supplier', async () => {
    await service.create('t1', 'u1', dto);
    expect(tx.stock.update).toHaveBeenCalledWith({ where: { id: 'st1' }, data: { quantity: 6 } });
    expect(tx.stockMovement.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ type: 'RETURN_OUT', quantity: 4, reason: 'Expired' }),
    );
    const debt = tx.debt.create.mock.calls[0][0].data;
    expect(debt.direction).toBe('RECEIVABLE');
    expect(debt.supplierId).toBe('s1');
    expect(debt.amount.toString()).toBe('20');
  });

  it('more than the stock on hand → 422 and no return recorded', async () => {
    tx.stock.upsert.mockResolvedValue({ id: 'st1', quantity: 2 });
    await expect(service.create('t1', 'u1', dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.debt.create).not.toHaveBeenCalled();
  });

  it('unknown supplier → 404 before any transaction', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.create('t1', 'u1', dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
