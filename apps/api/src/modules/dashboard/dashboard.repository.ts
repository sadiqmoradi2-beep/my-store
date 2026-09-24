import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const REVENUE_STATUSES: OrderStatus[] = ['APPROVED', 'DELIVERED'];

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  private revenueWhere(tenantId: string, since: Date, branchId?: string): Prisma.OrderWhereInput {
    return {
      tenantId,
      status: { in: REVENUE_STATUSES },
      createdAt: { gte: since },
      ...(branchId && { branchId }),
    };
  }

  sumSales(tenantId: string, since: Date, branchId?: string) {
    return this.prisma.order.aggregate({
      where: this.revenueWhere(tenantId, since, branchId),
      _sum: { total: true },
    });
  }

  revenueItems(tenantId: string, since: Date, branchId?: string) {
    return this.prisma.orderItem.findMany({
      where: { order: this.revenueWhere(tenantId, since, branchId) },
      select: { unitPrice: true, unitCost: true, quantity: true },
    });
  }

  countOrdersToday(tenantId: string, since: Date, branchId?: string) {
    return this.prisma.order.count({
      where: { tenantId, createdAt: { gte: since }, ...(branchId && { branchId }) },
    });
  }

  ordersByStatus(tenantId: string, branchId?: string) {
    return this.prisma.order.groupBy({
      by: ['status'],
      where: { tenantId, ...(branchId && { branchId }) },
      _count: { _all: true },
    });
  }

  topProducts(tenantId: string, since: Date, branchId?: string, take = 5) {
    return this.prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: { order: this.revenueWhere(tenantId, since, branchId) },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    });
  }
}
