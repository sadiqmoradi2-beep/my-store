import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationChannel, NotificationType, RoleKey } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string, query: PaginationQueryDto) {
    const where = { userId };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  unreadCount(userId: string) {
    return this.prisma.notification
      .count({ where: { userId, readAt: null } })
      .then((count) => ({ count }));
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

interface NotifyPayload {
  type: NotificationType;
  title: string;
  body?: string;
  refType?: string;
  refId?: string;
  /** Default IN_APP (immediately SENT); SMS/WHATSAPP are created with PENDING so the dispatch queue can deliver them */
  channel?: NotificationChannel;
}

/** Create a notification for all active users with the given roles in the tenant — returns the created rows */
export async function notifyRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
  roleKeys: RoleKey[],
  payload: NotifyPayload,
) {
  const users = await tx.user.findMany({
    where: { tenantId, deletedAt: null, status: 'ACTIVE', role: { key: { in: roleKeys } } },
    select: { id: true },
  });
  if (users.length === 0) return [];
  const channel = payload.channel ?? 'IN_APP';
  return tx.notification.createManyAndReturn({
    data: users.map((user) => ({
      tenantId,
      userId: user.id,
      ...payload,
      channel,
      dispatchStatus: channel === 'IN_APP' ? 'SENT' : 'PENDING',
    })),
  });
}

/** After stock deduction: alert for items that have fallen below the minimum */
export async function notifyLowStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productIds: string[],
  warehouseId: string,
) {
  const stocks = await tx.stock.findMany({
    where: { warehouseId, productId: { in: productIds } },
    include: { product: { select: { name: true, minStockLevel: true } } },
  });
  const low = stocks.filter(
    (s) => s.product.minStockLevel > 0 && s.quantity <= s.product.minStockLevel,
  );
  for (const stock of low) {
    await notifyRoles(tx, tenantId, ['ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_STAFF'], {
      type: 'LOW_STOCK',
      title: `Low stock: ${stock.product.name}`,
      body: `Stock ${stock.quantity} — minimum ${stock.product.minStockLevel}`,
      refType: 'product',
      refId: stock.productId,
    });
  }
}
