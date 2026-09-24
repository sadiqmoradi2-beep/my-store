import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { notifyRoles } from '../notifications/notifications.service';

const ALERT_ROLES = ['ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_STAFF'] as const;
/** How far ahead of the expiry date to start alerting */
const LOOKAHEAD_DAYS = 30;

/** Daily sweep for products expiring soon (or already expired) that haven't been alerted on today yet */
@Injectable()
export class ExpiryAlertsService {
  private readonly logger = new Logger(ExpiryAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 8 * * *')
  async sweep() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const horizon = new Date(dayStart.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        expiryDate: { lte: horizon },
        OR: [{ lastExpiryAlertAt: null }, { lastExpiryAlertAt: { lt: dayStart } }],
      },
      select: { id: true, tenantId: true, name: true, expiryDate: true },
    });

    for (const product of products) {
      try {
        await this.alert(product);
      } catch (error) {
        this.logger.error(`expiry alert failed for product ${product.id}`, error as Error);
      }
    }
  }

  private async alert(product: { id: string; tenantId: string; name: string; expiryDate: Date | null }) {
    const expired = product.expiryDate !== null && product.expiryDate.getTime() < Date.now();
    await this.prisma.$transaction(async (tx) => {
      await notifyRoles(tx, product.tenantId, [...ALERT_ROLES], {
        type: 'PRODUCT_EXPIRING',
        title: `${expired ? 'Expired' : 'Expiring soon'}: ${product.name}`,
        body: product.expiryDate
          ? `Expiry date: ${product.expiryDate.toISOString().slice(0, 10)}`
          : undefined,
        refType: 'product',
        refId: product.id,
      });
      await tx.product.update({ where: { id: product.id }, data: { lastExpiryAlertAt: new Date() } });
    });
  }
}
