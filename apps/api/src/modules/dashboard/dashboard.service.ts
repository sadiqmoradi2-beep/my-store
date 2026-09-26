import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { kabulDayStartUtc, kabulGregorianMonthStartUtc } from '@my-store/shared';
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

    const [today, month, lowStocks, top] = await Promise.all([
      this.repo.sumSales(tenantId, dayStart, branchId),
      this.repo.sumSales(tenantId, monthStart, branchId),
      this.inventoryService.lowStocks(tenantId),
      this.repo.topProducts(tenantId, monthStart, branchId),
    ]);
    const zero = new Prisma.Decimal(0);
    const totalOf = (r: typeof today) => r._sum.total ?? zero;
    const profitOf = (r: typeof today) => totalOf(r).sub(r._sum.cost ?? zero);

    return {
      todaySales: totalOf(today),
      monthSales: totalOf(month),
      todayProfit: profitOf(today),
      monthProfit: profitOf(month),
      todaySalesCount: today._count._all,
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
