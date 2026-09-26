import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CartsService } from './carts.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('CartsService.updateItem — price override', () => {
  let service: CartsService;
  let prisma: {
    cart: { findFirst: jest.Mock };
    cartItem: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      cart: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cart-1',
          tenantId: 't1',
          items: [
            {
              productId: 'p1',
              quantity: 2,
              unitPrice: D(200),
              product: { name: 'Product 1', unit: 'Piece', purchasePrice: D(180) },
            },
          ],
        }),
      },
      cartItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ci1' }),
        update: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CartsService);
  });

  it('without unitPrice → only the quantity is updated', async () => {
    await service.updateItem('t1', 'cart-1', 'p1', 3);
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'ci1' },
      data: { quantity: 3 },
    });
  });

  it('with unitPrice (seller price override) → the unit price also changes', async () => {
    await service.updateItem('t1', 'cart-1', 'p1', 2, 190);
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'ci1' },
      data: { quantity: 2, unitPrice: 190 },
    });
  });

  it('purchasePrice is available in the get() response for the loss warning', async () => {
    const result = await service.updateItem('t1', 'cart-1', 'p1', 2, 150);
    expect(result.items[0].purchasePrice.toString()).toBe('180');
  });
});

describe('CartsService.get', () => {
  it('total = subtotal (no discounts); cost from purchase prices', async () => {
    const prisma = {
      cart: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cart-1',
          tenantId: 't1',
          items: [
            { productId: 'p1', quantity: 2, unitPrice: D(200), product: { name: 'Product 1', unit: 'Piece', purchasePrice: D(150) } },
          ],
        }),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const result = await moduleRef.get(CartsService).get('t1', 'cart-1');
    expect(result.subtotal.toString()).toBe('400');
    expect(result.cost.toString()).toBe('300');
    expect(result.total.toString()).toBe('400');
  });
});
