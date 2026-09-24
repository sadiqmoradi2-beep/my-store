import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, skip: number, take: number, search?: string, categoryId?: string) {
    const where: Prisma.ProductWhereInput = {
      tenantId,
      deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    return Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: { select: { name: true } },
          stocks: { select: { quantity: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
  }

  findById(tenantId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: { select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        stocks: { include: { warehouse: { select: { name: true, branchId: true } } } },
      },
    });
  }

  findByBarcode(tenantId: string, barcode: string) {
    return this.prisma.product.findFirst({
      where: { tenantId, barcode, deletedAt: null, isActive: true },
      include: {
        category: { select: { name: true } },
        stocks: { include: { warehouse: { select: { name: true, branchId: true } } } },
      },
    });
  }

  findPriceHistory(tenantId: string, productId: string, take = 50) {
    return this.prisma.priceHistory.findMany({
      where: { tenantId, productId },
      include: { changedBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  findWarehouseIds(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
  }
}
