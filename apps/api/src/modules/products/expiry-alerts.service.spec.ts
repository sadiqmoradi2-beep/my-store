import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpiryAlertsService } from './expiry-alerts.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('ExpiryAlertsService.sweep', () => {
  let service: ExpiryAlertsService;
  let prisma: Record<string, unknown> & { product: { findMany: jest.Mock } };
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    tx = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
      notification: {
        createManyAndReturn: jest
          .fn()
          .mockImplementation(({ data }: { data: object[] }) => data.map((d, i) => ({ id: `n${i}`, ...d }))),
        createMany: jest.fn(),
      },
      product: { update: jest.fn() },
    };
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ExpiryAlertsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ExpiryAlertsService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('queries active products expiring within 30 days that were not alerted today', async () => {
    await service.sweep();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          isActive: true,
          expiryDate: { lte: expect.any(Date) },
          OR: [{ lastExpiryAlertAt: null }, { lastExpiryAlertAt: { lt: expect.any(Date) } }],
        }),
      }),
    );
    const horizon = (prisma.product.findMany.mock.calls[0][0].where.expiryDate as { lte: Date }).lte;
    const days = (horizon.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('marks the product as alerted after notifying', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', tenantId: 't1', name: 'Milk', expiryDate: new Date(Date.now() + 5 * DAY_MS) },
    ]);
    await service.sweep();
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { lastExpiryAlertAt: expect.any(Date) },
    });
  });

  it('keeps going when one product fails', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', tenantId: 't1', name: 'A', expiryDate: new Date() },
      { id: 'p2', tenantId: 't1', name: 'B', expiryDate: new Date() },
    ]);
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await service.sweep();
    expect(tx.product.update).toHaveBeenCalledTimes(1);
  });
});
