import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { createDebt } from '../debts/debts.service';
import { applyMovement } from '../inventory/inventory.service';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';

@Injectable()
export class PurchaseReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: PaginationQueryDto) {
    const where = { tenantId };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.purchaseReturn.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          supplier: { select: { name: true } },
          warehouse: { select: { name: true } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);
    const items = rows.map(({ supplier, warehouse, createdBy, ...row }) => ({
      ...row,
      supplierName: supplier.name,
      warehouseName: warehouse.name,
      createdByName: createdBy.fullName,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /**
   * Send a product back to its supplier: removes the stock, and records the returned value as a
   * receivable from the supplier (a credit/refund they owe) so it shows up under Debts.
   */
  async create(tenantId: string, userId: string, dto: CreatePurchaseReturnDto) {
    const [supplier, product, warehouse] = await Promise.all([
      this.prisma.supplier.findFirst({ where: { id: dto.supplierId, tenantId, deletedAt: null } }),
      this.prisma.product.findFirst({ where: { id: dto.productId, tenantId, deletedAt: null } }),
      this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, tenantId } }),
    ]);
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (!product) throw new NotFoundException('Product not found');
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const unitCost = product.purchasePrice;
    const total = unitCost.mul(dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          tenantId,
          supplierId: supplier.id,
          productId: product.id,
          productName: product.name,
          warehouseId: warehouse.id,
          quantity: dto.quantity,
          unitCost,
          total,
          note: dto.note,
          createdById: userId,
        },
      });
      await applyMovement(tx, {
        tenantId,
        userId,
        productId: product.id,
        warehouseId: warehouse.id,
        delta: -dto.quantity,
        type: 'RETURN_OUT',
        reason: dto.note,
        referenceType: 'purchase-return',
        referenceId: purchaseReturn.id,
      });
      if (total.greaterThan(0)) {
        await createDebt(tx, {
          tenantId,
          direction: 'RECEIVABLE',
          partyName: supplier.name,
          supplierId: supplier.id,
          amount: total as Prisma.Decimal,
          referenceType: 'purchase-return',
          referenceId: purchaseReturn.id,
          notes: `Return to supplier: ${product.name} × ${dto.quantity}${dto.note ? ` — ${dto.note}` : ''}`,
          createdById: userId,
        });
      }
      return purchaseReturn;
    });
  }
}
