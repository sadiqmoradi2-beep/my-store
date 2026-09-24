import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findStocks(tenantId: string, warehouseId?: string) {
    return this.prisma.stock.findMany({
      where: {
        tenantId,
        ...(warehouseId && { warehouseId }),
        product: { deletedAt: null },
      },
      include: {
        product: { select: { name: true, sku: true, minStockLevel: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });
  }

  findLowStocks(tenantId: string) {
    return this.prisma.$queryRaw<
      { productId: string; productName: string; warehouseName: string; quantity: number; minStockLevel: number }[]
    >`
      SELECT s."productId", p."name" AS "productName", w."name" AS "warehouseName",
             s."quantity", p."minStockLevel"
      FROM "Stock" s
      JOIN "Product" p ON p."id" = s."productId" AND p."deletedAt" IS NULL
      JOIN "Warehouse" w ON w."id" = s."warehouseId"
      WHERE s."tenantId" = ${tenantId} AND s."quantity" <= p."minStockLevel" AND p."minStockLevel" > 0
      ORDER BY s."quantity" ASC
    `;
  }

  findMovements(tenantId: string, skip: number, take: number, productId?: string) {
    const where = { tenantId, ...(productId && { productId }) };
    return Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take,
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
          performedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
  }

  findWarehouse(tenantId: string, id: string) {
    return this.prisma.warehouse.findFirst({ where: { id, tenantId, isActive: true } });
  }

  findProduct(tenantId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
  }
}
