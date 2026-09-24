import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CartsService } from '../carts/carts.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PosService } from './pos.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('PosService.sale', () => {
  let service: PosService;
  let carts: { checkout: jest.Mock };
  let orders: { transition: jest.Mock; get: jest.Mock };
  let payments: { create: jest.Mock };

  beforeEach(async () => {
    carts = { checkout: jest.fn().mockResolvedValue({ id: 'order-1', total: D(500) }) };
    orders = {
      transition: jest.fn(),
      get: jest.fn().mockResolvedValue({ id: 'order-1', status: 'DELIVERED' }),
    };
    payments = { create: jest.fn().mockResolvedValue({ id: 'pay-1' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PosService,
        { provide: CartsService, useValue: carts },
        { provide: OrdersService, useValue: orders },
        { provide: PaymentsService, useValue: payments },
      ],
    }).compile();
    service = moduleRef.get(PosService);
  });

  it('cash sale: full transition to DELIVERED + full payment + change', async () => {
    const result = await service.sale('t1', 'u1', { cartId: 'cart-1', cashReceived: 600 });
    expect(orders.transition.mock.calls.map((c) => c[3].toStatus)).toEqual(['APPROVED', 'DELIVERED']);
    expect(payments.create).toHaveBeenCalledWith('t1', 'u1', 'order-1', {
      amount: 500,
      registerId: undefined,
    });
    expect(result.change.toString()).toBe('100');
  });

  it('no cashReceived → exactly the order amount, no change', async () => {
    const result = await service.sale('t1', 'u1', { cartId: 'cart-1' });
    expect(result.change.toString()).toBe('0');
    expect(payments.create).toHaveBeenCalled();
  });

  it('amount received below the order amount → 422 and no transition/payment', async () => {
    await expect(
      service.sale('t1', 'u1', { cartId: 'cart-1', cashReceived: 400 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(orders.transition).not.toHaveBeenCalled();
    expect(payments.create).not.toHaveBeenCalled();
  });
});
