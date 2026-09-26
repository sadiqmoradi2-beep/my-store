import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  private saleWhere(tenantId: string, since: Date, branchId?: string): Prisma.SaleWhereInput {
    return {
      tenantId,
      createdAt: { gte: since },
      ...(branchId && { branchId }),
    };
  }

  sumSales(tenantId: string, since: Date, branchId?: string) {
    return this.prisma.sale.aggregate({
      where: this.saleWhere(tenantId, since, branchId),
      _sum: { total: true, cost: true },
      _count: { _all: true },
    });
  }

  topProducts(tenantId: string, since: Date, branchId?: string, take = 5) {
    return this.prisma.saleItem.groupBy({
      by: ['productId', 'productName'],
      where: { sale: this.saleWhere(tenantId, since, branchId) },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    });
  }
}
