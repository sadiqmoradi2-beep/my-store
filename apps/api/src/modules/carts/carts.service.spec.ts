import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { CartsService } from './carts.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('CartsService.checkout', () => {
  let service: CartsService;
  let prisma: { cart: { findFirst: jest.Mock; delete: jest.Mock } };
  let orders: { create: jest.Mock };

  const cart = {
    id: 'cart-1',
    tenantId: 't1',
    branchId: 'b1',
    items: [
      { productId: 'p1', quantity: 2, unitPrice: D(100), product: { name: 'Product 1' } },
      { productId: 'p2', quantity: 1, unitPrice: D(250), product: { name: 'Product 2' } },
    ],
  };

  beforeEach(async () => {
    prisma = {
      cart: {
        findFirst: jest.fn().mockResolvedValue({ ...cart }),
        delete: jest.fn(),
      },
    };
    orders = { create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 1 }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: orders },
      ],
    }).compile();
    service = moduleRef.get(CartsService);
  });

  it('cart → order with item mapping and cart deletion', async () => {
    const order = await service.checkout('t1', 'u1', 'cart-1', {
      notes: 'POS',
    });
    expect(orders.create).toHaveBeenCalledWith('t1', 'u1', {
      branchId: 'b1',
      notes: 'POS',
      items: [
        { productId: 'p1', quantity: 2, unitPrice: 100 },
        { productId: 'p2', quantity: 1, unitPrice: 250 },
      ],
    });
    expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
    expect(order.id).toBe('order-1');
  });

  it('empty cart → 422 and no order is created', async () => {
    prisma.cart.findFirst.mockResolvedValue({ ...cart, items: [] });
    await expect(service.checkout('t1', 'u1', 'cart-1', {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(orders.create).not.toHaveBeenCalled();
    expect(prisma.cart.delete).not.toHaveBeenCalled();
  });

  it('order creation error → cart is not deleted', async () => {
    orders.create.mockRejectedValue(new UnprocessableEntityException('Order rejected'));
    await expect(service.checkout('t1', 'u1', 'cart-1', {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.cart.delete).not.toHaveBeenCalled();
  });
});

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
        { provide: OrdersService, useValue: { create: jest.fn() } },
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
        { provide: OrdersService, useValue: { create: jest.fn() } },
      ],
    }).compile();
    const result = await moduleRef.get(CartsService).get('t1', 'cart-1');
    expect(result.subtotal.toString()).toBe('400');
    expect(result.cost.toString()).toBe('300');
    expect(result.total.toString()).toBe('400');
  });
});
