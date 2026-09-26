import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { rangeOf, ReportsService } from './reports.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('rangeOf', () => {
  it('بدون from/to → بازه پیش‌فرض ۳۰ روزه تا اکنون', () => {
    const { from, to } = rangeOf({});
    const diffDays = (to.getTime() - from.getTime()) / 86_400_000;
    expect(Math.round(diffDays)).toBe(30);
  });

  it('from و to صریح → همان بازه با تا انتهای روز', () => {
    const { from, to } = rangeOf({ from: '2026-01-01', to: '2026-01-10' });
    expect(from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
  });

  it('فقط from → to برابر اکنون است', () => {
    const before = new Date();
    const { from, to } = rangeOf({ from: '2025-01-01' });
    expect(from.toISOString().slice(0, 10)).toBe('2025-01-01');
    expect(to.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('فقط to → from برابر ۳۰ روز قبل از to است', () => {
    const { from, to } = rangeOf({ to: '2026-02-15' });
    const diffDays = (to.getTime() - from.getTime()) / 86_400_000;
    expect(Math.round(diffDays)).toBe(30);
  });
});

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    $queryRaw: jest.Mock;
    saleItem: { groupBy: jest.Mock };
    product: { findMany: jest.Mock };
    branch: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      saleItem: { groupBy: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CacheService,
          useValue: { wrap: jest.fn((_key: string, _ttl: number, fn: () => unknown) => fn()) },
        },
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  describe('sales', () => {
    it('بدون نتیجه → جمع‌ها صفر بدون خطا (نه null/NaN)', async () => {
      const result = await service.sales('t1', {});
      expect(result.points).toEqual([]);
      expect(result.totals.salesTotal.toString()).toBe('0');
      expect(result.totals.salesCost.toString()).toBe('0');
      expect(result.totals.profit.toString()).toBe('0');
      expect(result.totals.salesCount).toBe(0);
      expect(result.totals.averageSale.toString()).toBe('0');
      expect(Number.isNaN(result.totals.averageSale.toNumber())).toBe(false);
    });

    it('با نتیجه → سود و جمع صحیح محاسبه می‌شود', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { bucket: new Date('2026-01-05'), total: D(500), cost: D(200), sales: 3 },
      ]);
      const result = await service.sales('t1', {});
      expect(result.totals.salesTotal.toString()).toBe('500');
      expect(result.totals.profit.toString()).toBe('300');
      expect(result.totals.averageSale.toString()).toBe('166.67');
    });
  });

  describe('products', () => {
    it('بدون نتیجه → top و low خالی بدون خطا', async () => {
      const result = await service.products('t1', {});
      expect(result.top).toEqual([]);
      expect(result.low).toEqual([]);
    });

    it('_sum خالی → quantity/revenue صفر', async () => {
      prisma.saleItem.groupBy
        .mockResolvedValueOnce([{ productId: 'p1', _sum: { quantity: null, total: null } }])
        .mockResolvedValueOnce([]);
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'محصول ۱' }]);
      const result = await service.products('t1', {});
      expect(result.top[0]).toEqual(
        expect.objectContaining({ productId: 'p1', name: 'محصول ۱', quantity: 0 }),
      );
      expect(result.top[0].revenue.toString()).toBe('0');
    });
  });

  describe('branches', () => {
    it('بدون نتیجه → آرایه خالی', async () => {
      const result = await service.branches('t1', {});
      expect(result).toEqual([]);
    });

    it('با نتیجه → سود هر شعبه = فروش منهای هزینه', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { branchId: 'b1', total: D(1000), cost: D(400), sales: 5 },
        { branchId: 'b2', total: D(300), cost: D(300), sales: 2 },
      ]);
      prisma.branch.findMany.mockResolvedValue([
        { id: 'b1', name: 'شعبه مرکزی' },
        { id: 'b2', name: 'شعبه دوم' },
      ]);
      const result = await service.branches('t1', {});
      expect(result[0]).toEqual(
        expect.objectContaining({ branchId: 'b1', name: 'شعبه مرکزی', salesCount: 5 }),
      );
      expect(result[0].profit.toString()).toBe('600');
      expect(result[1].profit.toString()).toBe('0');
    });
  });

  describe('sellers', () => {
    it('بدون نتیجه → آرایه خالی', async () => {
      const result = await service.sellers('t1', {});
      expect(result).toEqual([]);
    });

    it('با نتیجه → سود و تعداد اجناس فروخته‌شده هر فروشنده', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { sellerId: 'u1', total: D(1000), cost: D(400), quantity: 12, sales: 5 },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', fullName: 'فروشنده یک' }]);
      const result = await service.sellers('t1', {});
      expect(result[0]).toEqual(
        expect.objectContaining({
          sellerId: 'u1',
          name: 'فروشنده یک',
          salesCount: 5,
          itemsSold: 12,
        }),
      );
      expect(result[0].profit.toString()).toBe('600');
    });
  });
});
