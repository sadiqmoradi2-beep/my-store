import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { kabulDayStartUtc, kabulGregorianMonthStartUtc, ORDER_STATUSES } from '@my-store/shared';
import { CacheService } from '../../redis/cache.service';
import { InventoryService } from '../inventory/inventory.service';
import { DashboardRepository } from './dashboard.repository';

const SUMMARY_TTL_SECONDS = 30;

@Injectable()
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly inventoryService: InventoryService,
    private readonly cache: CacheService,
  ) {}

  summary(tenantId: string, branchId?: string) {
    const key = `dash:${tenantId}:${branchId ?? 'all'}`;
    return this.cache.wrap(key, SUMMARY_TTL_SECONDS, () => this.computeSummary(tenantId, branchId));
  }

  private async computeSummary(tenantId: string, branchId?: string) {
    const dayStart = kabulDayStartUtc();
    const monthStart = kabulGregorianMonthStartUtc();

    const [todaySales, monthSales, todayItems, monthItems, todayOrders, byStatus, lowStocks, top] =
      await Promise.all([
        this.repo.sumSales(tenantId, dayStart, branchId),
        this.repo.sumSales(tenantId, monthStart, branchId),
        this.repo.revenueItems(tenantId, dayStart, branchId),
        this.repo.revenueItems(tenantId, monthStart, branchId),
        this.repo.countOrdersToday(tenantId, dayStart, branchId),
        this.repo.ordersByStatus(tenantId, branchId),
        this.inventoryService.lowStocks(tenantId),
        this.repo.topProducts(tenantId, monthStart, branchId),
      ]);

    const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
      string,
      number
    >;
    for (const row of byStatus) {
      ordersByStatus[row.status] = row._count._all;
    }

    return {
      todaySales: todaySales._sum.total ?? new Prisma.Decimal(0),
      monthSales: monthSales._sum.total ?? new Prisma.Decimal(0),
      todayProfit: profitOf(todayItems),
      monthProfit: profitOf(monthItems),
      todayOrders,
      ordersByStatus,
      lowStockCount: lowStocks.length,
      topProducts: top.map((row) => ({
        productId: row.productId,
        name: row.productName,
        quantity: row._sum.quantity ?? 0,
        total: row._sum.total ?? new Prisma.Decimal(0),
      })),
    };
  }
}

function profitOf(
  items: { unitPrice: Prisma.Decimal; unitCost: Prisma.Decimal; quantity: number }[],
) {
  return items.reduce(
    (sum, i) => sum.add(i.unitPrice.sub(i.unitCost).mul(i.quantity)),
    new Prisma.Decimal(0),
  );
}
