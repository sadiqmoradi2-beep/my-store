import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CacheService } from '../../redis/cache.service';
import { InventoryService } from '../inventory/inventory.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

const D = (v: number) => new Prisma.Decimal(v);
const sums = (total: number | null, cost: number | null, count = 0) => ({
  _sum: { total: total == null ? null : D(total), cost: cost == null ? null : D(cost) },
  _count: { _all: count },
});

describe('DashboardService.summary', () => {
  let service: DashboardService;
  let repo: { sumSales: jest.Mock; topProducts: jest.Mock };
  let inventoryService: { lowStocks: jest.Mock };

  beforeEach(async () => {
    repo = {
      sumSales: jest.fn().mockResolvedValue(sums(1000, 700, 5)),
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

  it('today/month profit = sales total minus the cost of the items sold', async () => {
    repo.sumSales.mockResolvedValueOnce(sums(300, 200, 2)).mockResolvedValueOnce(sums(1000, 640, 9));
    const result = await service.summary('t1');
    expect(result.todaySales.toString()).toBe('300');
    expect(result.todayProfit.toString()).toBe('100');
    expect(result.monthSales.toString()).toBe('1000');
    expect(result.monthProfit.toString()).toBe('360');
    expect(result.todaySalesCount).toBe(2);
  });

  it('empty aggregate → Decimal(0) instead of null', async () => {
    repo.sumSales.mockResolvedValue(sums(null, null, 0));
    const result = await service.summary('t1');
    expect(result.todaySales).toBeInstanceOf(Prisma.Decimal);
    expect(result.todaySales.toString()).toBe('0');
    expect(result.monthSales.toString()).toBe('0');
    expect(result.todayProfit.toString()).toBe('0');
  });

  it('topProducts with an empty _sum → quantity/total zero', async () => {
    repo.topProducts.mockResolvedValue([
      { productId: 'p1', productName: 'Product 1', _sum: { quantity: null, total: null } },
    ]);
    const result = await service.summary('t1');
    expect(result.topProducts[0].quantity).toBe(0);
    expect(result.topProducts[0].total.toString()).toBe('0');
  });

  it('passes branchId to the repository', async () => {
    await service.summary('t1', 'b1');
    expect(repo.sumSales).toHaveBeenCalledWith('t1', expect.any(Date), 'b1');
    expect(repo.topProducts).toHaveBeenCalledWith('t1', expect.any(Date), 'b1');
  });

  it('low stock count comes from the inventory service', async () => {
    inventoryService.lowStocks.mockResolvedValue([{}, {}, {}]);
    const result = await service.summary('t1');
    expect(result.lowStockCount).toBe(3);
  });
});
