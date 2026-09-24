import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertPaid, PaymentGatewayService } from './payment-gateway.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('PaymentGatewayService', () => {
  let service: PaymentGatewayService;
  let prisma: {
    gatewayIntent: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      gatewayIntent: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'gi1', ...data })),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'gi1', status: 'PENDING', ...data })),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PaymentGatewayService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PaymentGatewayService);
  });

  describe('createIntent', () => {
    it('defaults the currency to USDT', async () => {
      const intent = await service.createIntent('t1', 'u1', {
        purpose: 'ORDER_PAYMENT',
        amount: 100,
      } as never);
      expect(intent.currency).toBe('USDT');
      expect(intent.amount).toEqual(D(100));
    });
  });

  describe('confirmIntent', () => {
    it('intent در وضعیت PENDING → به PAID تغییر می‌کند', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue({ id: 'gi1', status: 'PENDING' });
      const result = await service.confirmIntent('t1', 'gi1', { providerRef: 'ref1' });
      expect(result.status).toBe('PAID');
      expect(prisma.gatewayIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', providerRef: 'ref1' }) }),
      );
    });

    it('intent از قبل PAID → بدون خطا، همان intent برگردانده می‌شود', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue({ id: 'gi1', status: 'PAID' });
      const result = await service.confirmIntent('t1', 'gi1', {});
      expect(result.status).toBe('PAID');
      expect(prisma.gatewayIntent.update).not.toHaveBeenCalled();
    });

    it('intent در وضعیت FAILED/EXPIRED → خطا', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue({ id: 'gi1', status: 'FAILED' });
      await expect(service.confirmIntent('t1', 'gi1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('intent یافت نشد → 404', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue(null);
      await expect(service.confirmIntent('t1', 'gi1', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertPaid', () => {
    it('PAID و مبلغ برابر → بدون خطا', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue({ id: 'gi1', status: 'PAID', amount: D(100) });
      await expect(
        assertPaid(prisma as never, 't1', 'gi1', D(100)),
      ).resolves.toBeUndefined();
    });

    it('هنوز PENDING → خطا', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue({ id: 'gi1', status: 'PENDING', amount: D(100) });
      await expect(assertPaid(prisma as never, 't1', 'gi1', D(100))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('مبلغ ناهم‌خوان → خطا', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue({ id: 'gi1', status: 'PAID', amount: D(50) });
      await expect(assertPaid(prisma as never, 't1', 'gi1', D(100))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('یافت نشد → 404', async () => {
      prisma.gatewayIntent.findFirst.mockResolvedValue(null);
      await expect(assertPaid(prisma as never, 't1', 'gi1', D(100))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
