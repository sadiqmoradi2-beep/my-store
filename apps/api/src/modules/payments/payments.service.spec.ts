import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from './payments.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('PaymentsService.create', () => {
  let service: PaymentsService;
  let prisma: {
    order: { findFirst: jest.Mock };
    cashRegister: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: Record<string, Record<string, jest.Mock>>;

  const order = {
    id: 'order-1',
    tenantId: 't1',
    branchId: 'b1',
    orderNumber: 7,
    status: 'APPROVED',
    total: D(500),
    paidTotal: D(0),
  };

  beforeEach(async () => {
    tx = {
      payment: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'pay-1', ...data })) },
      order: { update: jest.fn() },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue({ balance: D(1000), isActive: true }),
        update: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
    };
    prisma = {
      order: { findFirst: jest.fn().mockResolvedValue({ ...order }) },
      cashRegister: { findFirst: jest.fn().mockResolvedValue({ id: 'reg-1' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PaymentsService);
  });

  it('پرداخت جزئی → PARTIAL و paidTotal به‌روز', async () => {
    await service.create('t1', 'u1', 'order-1', { amount: 200 });
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data.paidTotal.toString()).toBe('200');
    expect(data.paymentStatus).toBe('PARTIAL');
  });

  it('پرداخت کامل → PAID', async () => {
    prisma.order.findFirst.mockResolvedValue({ ...order, paidTotal: D(300) });
    await service.create('t1', 'u1', 'order-1', { amount: 200 });
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data.paidTotal.toString()).toBe('500');
    expect(data.paymentStatus).toBe('PAID');
  });

  it('بیش از باقیمانده → 422 و بدون ثبت', async () => {
    prisma.order.findFirst.mockResolvedValue({ ...order, paidTotal: D(400) });
    await expect(
      service.create('t1', 'u1', 'order-1', { amount: 200 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('سفارش لغوشده → 422', async () => {
    prisma.order.findFirst.mockResolvedValue({ ...order, status: 'CANCELLED' });
    await expect(
      service.create('t1', 'u1', 'order-1', { amount: 100 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('CASH: صندوق پیش‌فرض شعبه + تراکنش SALE + افزایش موجودی', async () => {
    await service.create('t1', 'u1', 'order-1', { amount: 500 });
    expect(prisma.cashRegister.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', branchId: 'b1', isDefault: true, isActive: true },
      }),
    );
    expect(tx.cashRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: D(1500) } }),
    );
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.type).toBe('SALE');
    expect(cashData.referenceId).toBe('order-1');
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ registerId: 'reg-1' }) }),
    );
  });

  it('CASH بدون صندوق فعال → 422', async () => {
    prisma.cashRegister.findFirst.mockResolvedValue(null);
    await expect(
      service.create('t1', 'u1', 'order-1', { amount: 100 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
