import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KABUL_UTC_OFFSET_MINUTES } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { ReportRangeQueryDto, SalesReportQueryDto } from './dto/report.dto';

const DAY_MS = 86_400_000;
const REPORT_TTL_SECONDS = 120;

interface RawSalesPoint {
  bucket: Date;
  total: Prisma.Decimal;
  cost: Prisma.Decimal;
  sales: number;
}

interface RawBranchRow {
  branchId: string;
  total: Prisma.Decimal;
  cost: Prisma.Decimal;
  sales: number;
}

interface RawSellerRow {
  sellerId: string;
  total: Prisma.Decimal;
  cost: Prisma.Decimal;
  quantity: number;
  sales: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private cacheKey(report: string, tenantId: string, query: object): string {
    return `report:${report}:${tenantId}:${JSON.stringify(query)}`;
  }

  /** Time series of sales/profit + range total */
  sales(tenantId: string, query: SalesReportQueryDto) {
    return this.cache.wrap(this.cacheKey('sales', tenantId, query), REPORT_TTL_SECONDS, () =>
      this.computeSales(tenantId, query),
    );
  }

  private async computeSales(tenantId: string, query: SalesReportQueryDto) {
    const { from, to } = rangeOf(query);
    const trunc = query.granularity === 'month' ? 'month' : 'day';
    const branchFilter = query.branchId
      ? Prisma.sql`AND s."branchId" = ${query.branchId}`
      : Prisma.empty;

    // The day/month boundary is computed based on Kabul time: createdAt is shifted forward so
    // date_trunc aligns with Kabul midnight, then the result is shifted back by the same amount
    // (consistent with endOfKabulDay)
    const rows = await this.prisma.$queryRaw<RawSalesPoint[]>`
      SELECT date_trunc(${trunc}, s."createdAt" + (${KABUL_UTC_OFFSET_MINUTES} * interval '1 minute'))
               - (${KABUL_UTC_OFFSET_MINUTES} * interval '1 minute') AS bucket,
             COALESCE(SUM(s.total), 0)           AS total,
             COALESCE(SUM(s.cost), 0)            AS cost,
             COUNT(*)::int                       AS sales
      FROM "Sale" s
      WHERE s."tenantId" = ${tenantId}
        AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
        ${branchFilter}
      GROUP BY bucket
      ORDER BY bucket`;

    const zero = new Prisma.Decimal(0);
    const points = rows.map((row) => ({
      bucket: row.bucket,
      total: row.total,
      cost: row.cost,
      profit: row.total.sub(row.cost),
      sales: row.sales,
    }));
    const salesTotal = points.reduce((sum, p) => sum.add(p.total), zero);
    const salesCost = points.reduce((sum, p) => sum.add(p.cost), zero);
    const salesCount = points.reduce((sum, p) => sum + p.sales, 0);
    return {
      points,
      totals: {
        salesTotal,
        salesCost,
        profit: salesTotal.sub(salesCost),
        salesCount,
        averageSale: salesCount > 0 ? salesTotal.div(salesCount).toDecimalPlaces(2) : zero,
      },
    };
  }

  /** Best-selling and worst-selling products in the range */
  products(tenantId: string, query: ReportRangeQueryDto) {
    return this.cache.wrap(this.cacheKey('products', tenantId, query), REPORT_TTL_SECONDS, () =>
      this.computeProducts(tenantId, query),
    );
  }

  private async computeProducts(tenantId: string, query: ReportRangeQueryDto) {
    const { from, to } = rangeOf(query);
    const where = {
      sale: { tenantId, createdAt: { gte: from, lte: to } },
    };
    const [top, low] = await Promise.all([
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where,
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where,
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'asc' } },
        take: 10,
      }),
    ]);
    const ids = [...new Set([...top, ...low].map((r) => r.productId))];
    const names = new Map(
      (
        await this.prisma.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      ).map((p) => [p.id, p.name]),
    );
    const toRow = (r: (typeof top)[number]) => ({
      productId: r.productId,
      name: names.get(r.productId) ?? '—',
      quantity: r._sum.quantity ?? 0,
      revenue: r._sum.total ?? new Prisma.Decimal(0),
    });
    return { top: top.map(toRow), low: low.map(toRow) };
  }

  /** Cash flow broken down by type and category */
  cash(tenantId: string, query: ReportRangeQueryDto) {
    return this.cache.wrap(this.cacheKey('cash', tenantId, query), REPORT_TTL_SECONDS, () =>
      this.computeCash(tenantId, query),
    );
  }

  private async computeCash(tenantId: string, query: ReportRangeQueryDto) {
    const { from, to } = rangeOf(query);
    const rows = await this.prisma.cashTransaction.groupBy({
      by: ['type', 'category'],
      where: { tenantId, createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return rows
      .map((row) => ({
        type: row.type,
        category: row.category,
        total: row._sum.amount ?? new Prisma.Decimal(0),
        count: row._count._all,
      }))
      .sort((a, b) => b.total.comparedTo(a.total));
  }

  /** Sales broken down by branch */
  branches(tenantId: string, query: ReportRangeQueryDto) {
    return this.cache.wrap(this.cacheKey('branches', tenantId, query), REPORT_TTL_SECONDS, () =>
      this.computeBranches(tenantId, query),
    );
  }

  private async computeBranches(tenantId: string, query: ReportRangeQueryDto) {
    const { from, to } = rangeOf(query);
    const rows = await this.prisma.$queryRaw<RawBranchRow[]>`
      SELECT s."branchId"                        AS "branchId",
             COALESCE(SUM(s.total), 0)           AS total,
             COALESCE(SUM(s.cost), 0)            AS cost,
             COUNT(*)::int                       AS sales
      FROM "Sale" s
      WHERE s."tenantId" = ${tenantId}
        AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
      GROUP BY s."branchId"
      ORDER BY total DESC`;
    const names = new Map(
      (
        await this.prisma.branch.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        })
      ).map((b) => [b.id, b.name]),
    );
    return rows.map((row) => ({
      branchId: row.branchId,
      name: names.get(row.branchId) ?? '—',
      salesCount: row.sales,
      total: row.total,
      cost: row.cost,
      profit: row.total.sub(row.cost),
    }));
  }

  /** Top sellers in the range — profit, number of items sold, and total sales per seller */
  sellers(tenantId: string, query: ReportRangeQueryDto) {
    return this.cache.wrap(this.cacheKey('sellers', tenantId, query), REPORT_TTL_SECONDS, () =>
      this.computeSellers(tenantId, query),
    );
  }

  private async computeSellers(tenantId: string, query: ReportRangeQueryDto) {
    const { from, to } = rangeOf(query);
    const rows = await this.prisma.$queryRaw<RawSellerRow[]>`
      SELECT s."createdById"                       AS "sellerId",
             COALESCE(SUM(s.total), 0)              AS total,
             COALESCE(SUM(s.cost), 0)               AS cost,
             COALESCE(SUM(c.quantity), 0)::int       AS quantity,
             COUNT(*)::int                          AS sales
      FROM "Sale" s
      JOIN LATERAL (
        SELECT COALESCE(SUM(si.quantity), 0) AS quantity
        FROM "SaleItem" si WHERE si."saleId" = s.id
      ) c ON true
      WHERE s."tenantId" = ${tenantId}
        AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
      GROUP BY s."createdById"
      ORDER BY total DESC`;
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: rows.map((r) => r.sellerId) } },
          select: { id: true, fullName: true },
        })
      ).map((u) => [u.id, u.fullName]),
    );
    return rows.map((row) => ({
      sellerId: row.sellerId,
      name: names.get(row.sellerId) ?? '—',
      salesCount: row.sales,
      itemsSold: row.quantity,
      total: row.total,
      cost: row.cost,
      profit: row.total.sub(row.cost),
    }));
  }
}

/** Report range — defaults to the last 30 days; "to" includes the entire final day (Kabul time) */
export function rangeOf(query: ReportRangeQueryDto): { from: Date; to: Date } {
  const to = query.to ? endOfKabulDay(new Date(query.to)) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY_MS);
  return { from, to };
}

const KABUL_OFFSET_MS = KABUL_UTC_OFFSET_MINUTES * 60_000;

/**
 * End of day in Kabul time (UTC+4:30) expressed in UTC — independent of the server's time zone,
 * and consistent with the shift applied to date_trunc in computeSales.
 */
function endOfKabulDay(date: Date): Date {
  const kabul = new Date(date.getTime() + KABUL_OFFSET_MS);
  const kabulMidnightUtc = Date.UTC(kabul.getUTCFullYear(), kabul.getUTCMonth(), kabul.getUTCDate());
  return new Date(kabulMidnightUtc - KABUL_OFFSET_MS + DAY_MS - 1);
}
