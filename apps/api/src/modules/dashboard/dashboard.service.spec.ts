import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CacheService } from '../../redis/cache.service';
import { InventoryService } from '../inventory/inventory.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('DashboardService.summary', () => {
  let service: DashboardService;
  let repo: {
    sumSales: jest.Mock;
    revenueItems: jest.Mock;
    countOrdersToday: jest.Mock;
    ordersByStatus: jest.Mock;
    topProducts: jest.Mock;
  };
  let inventoryService: { lowStocks: jest.Mock };

  beforeEach(async () => {
    repo = {
      sumSales: jest.fn().mockResolvedValue({ _sum: { total: D(1000) } }),
      revenueItems: jest.fn().mockResolvedValue([]),
      countOrdersToday: jest.fn().mockResolvedValue(5),
      ordersByStatus: jest.fn().mockResolvedValue([]),
      topProducts: jest.fn().mockResolvedValue([]),
    };
    inventoryService = { lowStocks: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardRepository, useValue: repo },
        { provide: InventoryService, useValue: inventoryService },
        {
          provide: CacheService,
          useValue: { wrap: jest.fn((_key: string, _ttl: number, fn: () => unknown) => fn()) },
        },
      ],
    }).compile();
    service = moduleRef.get(DashboardService);
  });

  it('سود روز/ماه را از اقلام سفارش محاسبه می‌کند', async () => {
    repo.revenueItems
      .mockResolvedValueOnce([
        { unitPrice: D(100), unitCost: D(60), quantity: 2 },
        { unitPrice: D(50), unitCost: D(30), quantity: 1 },
      ])
      .mockResolvedValueOnce([{ unitPrice: D(200), unitCost: D(150), quantity: 3 }]);

    const result = await service.summary('t1');

    // روز: (100-60)*2 + (50-30)*1 = 80 + 20 = 100
    expect(result.todayProfit.toString()).toBe('100');
    // ماه: (200-150)*3 = 150
    expect(result.monthProfit.toString()).toBe('150');
  });

  it('sum خالی از aggregate → Decimal(0) به‌جای null', async () => {
    repo.sumSales.mockResolvedValue({ _sum: { total: null } });
    const result = await service.summary('t1');
    expect(result.todaySales).toBeInstanceOf(Prisma.Decimal);
    expect(result.todaySales.toString()).toBe('0');
    expect(result.monthSales.toString()).toBe('0');
  });

  it('بدون اقلام سفارش → سود صفر (بدون خطا)', async () => {
    const result = await service.summary('t1');
    expect(result.todayProfit.toString()).toBe('0');
    expect(result.monthProfit.toString()).toBe('0');
  });

  it('ordersByStatus همه وضعیت‌ها را با پیش‌فرض صفر برمی‌گرداند', async () => {
    repo.ordersByStatus.mockResolvedValue([{ status: 'DELIVERED', _count: { _all: 7 } }]);
    const result = await service.summary('t1');
    expect(result.ordersByStatus.DELIVERED).toBe(7);
    expect(result.ordersByStatus.PENDING).toBe(0);
    expect(result.ordersByStatus.CANCELLED).toBe(0);
  });

  it('topProducts با _sum خالی → quantity/total صفر', async () => {
    repo.topProducts.mockResolvedValue([
      { productId: 'p1', productName: 'محصول ۱', _sum: { quantity: null, total: null } },
    ]);
    const result = await service.summary('t1');
    expect(result.topProducts[0].quantity).toBe(0);
    expect(result.topProducts[0].total.toString()).toBe('0');
  });

  it('branchId را به تمام متدهای repo پاس می‌دهد', async () => {
    await service.summary('t1', 'b1');
    expect(repo.sumSales).toHaveBeenCalledWith('t1', expect.any(Date), 'b1');
    expect(repo.countOrdersToday).toHaveBeenCalledWith('t1', expect.any(Date), 'b1');
    expect(repo.ordersByStatus).toHaveBeenCalledWith('t1', 'b1');
  });
});
