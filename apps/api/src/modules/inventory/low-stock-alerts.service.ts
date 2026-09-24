import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { notifyRoles } from '../notifications/notifications.service';

const ALERT_ROLES = ['ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_STAFF'] as const;

interface LowStockRow {
  tenantId: string;
  productId: string;
  productName: string;
  quantity: number;
  minStockLevel: number;
}

/** Daily sweep across all tenants for items that fell below the minimum without a new warehouse movement (e.g. after a threshold change) */
@Injectable()
export class LowStockAlertsService {
  private readonly logger = new Logger(LowStockAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 8 * * *')
  async sweep() {
    const rows = await this.prisma.$queryRaw<LowStockRow[]>`
      SELECT s."tenantId", s."productId", p."name" AS "productName", s."quantity", p."minStockLevel"
      FROM "Stock" s
      JOIN "Product" p ON p."id" = s."productId" AND p."deletedAt" IS NULL
      WHERE s."quantity" <= p."minStockLevel" AND p."minStockLevel" > 0
      ORDER BY s."tenantId", s."quantity" ASC
    `;

    for (const row of rows) {
      try {
        await notifyRoles(this.prisma, row.tenantId, [...ALERT_ROLES], {
          type: 'LOW_STOCK',
          title: `Low stock: ${row.productName}`,
          body: `Stock ${row.quantity} — minimum ${row.minStockLevel}`,
          refType: 'product',
          refId: row.productId,
        });
      } catch (error) {
        this.logger.error(`low stock sweep failed for product ${row.productId}`, error as Error);
      }
    }
  }
}
