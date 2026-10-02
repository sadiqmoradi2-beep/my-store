import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { applyMovement } from '../inventory/inventory.service';
import { notifyLowStock } from '../notifications/notifications.service';
import { findDefaultWarehouse } from '../branches/default-warehouse';
import { recordCashTransaction } from '../cash/cash.service';
import { createDebt } from '../debts/debts.service';
import {
  CreatePurchaseDto,
  CreateSupplierDto,
  PurchaseListQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const [stats, lastPurchases] = await Promise.all([
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: { tenantId },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: { tenantId },
        _max: { purchaseNumber: true },
      }),
    ]);
    const byId = new Map(stats.map((s) => [s.supplierId, s]));
    const lastPurchaseById = new Map(lastPurchases.map((p) => [p.supplierId, p._max.purchaseNumber]));
    return suppliers.map((supplier) => ({
      ...supplier,
      purchasesCount: byId.get(supplier.id)?._count._all ?? 0,
      purchasesTotal: byId.get(supplier.id)?._sum.total ?? new Prisma.Decimal(0),
      lastPurchaseNumber: lastPurchaseById.get(supplier.id) ?? null,
    }));
  }

  async create(tenantId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    await this.get(tenantId, id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const used = await this.prisma.purchase.count({ where: { supplierId: id } });
    if (used > 0) {
      throw new UnprocessableEntityException('Supplier has purchases on record — deactivate it instead');
    }
    return this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async get(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  /**
   * Record a purchase in a single transaction: purchase document + stock inflow to the
   * branch's default warehouse + product purchase price update (+PriceHistory) + cash
   * register expense for the amount paid + debt document for the remainder.
   */
  async createPurchase(tenantId: string, userId: string, dto: CreatePurchaseDto) {
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    // A typo'd year shouldn't slip through: allow up to one day ahead for time-zone differences
    if (receivedAt.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException('The received date cannot be in the future');
    }
    const supplier = await this.get(tenantId, dto.supplierId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, isActive: true },
      select: { id: true, name: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    const warehouse = await findDefaultWarehouse(this.prisma, tenantId, branch);

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    if (productIds.length !== dto.items.length) {
      throw new BadRequestException('Duplicate product in purchase items');
    }
    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, deletedAt: null },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const id of productIds) {
      if (!productMap.has(id)) throw new BadRequestException('One of the products in the purchase is not valid');
    }

    const items = dto.items.map((item) => {
      const unitCost = new Prisma.Decimal(item.unitCost);
      return {
        productId: item.productId,
        productName: productMap.get(item.productId)!.name,
        quantity: item.quantity,
        unitCost,
        total: unitCost.mul(item.quantity),
      };
    });
    const total = items.reduce((sum, i) => sum.add(i.total), new Prisma.Decimal(0));
    const paidAmount = new Prisma.Decimal(dto.paidAmount ?? 0);
    if (paidAmount.greaterThan(total)) {
      throw new UnprocessableEntityException('Amount paid exceeds the total purchase amount');
    }

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.purchase.findFirst({
        where: { tenantId },
        orderBy: { purchaseNumber: 'desc' },
        select: { purchaseNumber: true },
      });
      const purchase = await tx.purchase.create({
        data: {
          tenantId,
          purchaseNumber: (last?.purchaseNumber ?? 0) + 1,
          supplierId: dto.supplierId,
          branchId: dto.branchId,
          total,
          paidAmount,
          invoiceImageUrl: dto.invoiceImageUrl,
          notes: dto.notes,
          receivedAt,
          createdById: userId,
          items: { create: items },
        },
        include: { items: true },
      });

      for (const item of items) {
        await applyMovement(tx, {
          tenantId,
          userId,
          productId: item.productId,
          warehouseId: warehouse.id,
          delta: item.quantity,
          type: 'PURCHASE_IN',
          referenceType: 'purchase',
          referenceId: purchase.id,
        });
        await notifyLowStock(tx, tenantId, [item.productId], warehouse.id);
        const product = productMap.get(item.productId)!;
        if (!product.purchasePrice.equals(item.unitCost)) {
          await tx.product.update({
            where: { id: item.productId },
            data: { purchasePrice: item.unitCost },
          });
          await tx.priceHistory.create({
            data: {
              tenantId,
              productId: item.productId,
              priceType: 'PURCHASE',
              oldPrice: product.purchasePrice,
              newPrice: item.unitCost,
              changedById: userId,
              note: `Purchase #${purchase.purchaseNumber}`,
            },
          });
        }
      }

      if (paidAmount.greaterThan(0)) {
        if (dto.registerId) {
          await recordCashTransaction(tx, {
            tenantId,
            userId,
            registerId: dto.registerId,
            type: 'EXPENSE',
            amount: paidAmount,
            category: 'Goods purchase',
            note: `Purchase #${purchase.purchaseNumber} — ${supplier.name}`,
            referenceType: 'purchase',
            referenceId: purchase.id,
          });
        }
      }
      const remaining = total.sub(paidAmount);
      if (remaining.greaterThan(0)) {
        await createDebt(tx, {
          tenantId,
          direction: 'PAYABLE',
          partyName: supplier.name,
          supplierId: supplier.id,
          amount: remaining,
          referenceType: 'purchase',
          referenceId: purchase.id,
          notes: `Remaining balance for purchase #${purchase.purchaseNumber}`,
          createdById: userId,
        });
      }
      return purchase;
    });
  }

  /** Every product bought from a supplier: total quantity and cost, number of purchases, last purchase date */
  async productSummary(tenantId: string, supplierId: string) {
    await this.get(tenantId, supplierId);
    // ponytail: aggregated in memory; move to a SQL GROUP BY if a supplier reaches tens of thousands of lines
    const items = await this.prisma.purchaseItem.findMany({
      where: { purchase: { tenantId, supplierId } },
      select: { productId: true, productName: true, quantity: true, total: true, purchase: { select: { receivedAt: true } } },
      orderBy: { purchase: { receivedAt: 'desc' } },
    });
    const byProduct = new Map<
      string,
      { productId: string; productName: string; quantity: number; total: Prisma.Decimal; purchases: number; lastPurchasedAt: Date }
    >();
    for (const item of items) {
      const row = byProduct.get(item.productId);
      if (row) {
        row.quantity += item.quantity;
        row.total = row.total.add(item.total);
        row.purchases += 1;
      } else {
        byProduct.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          total: item.total,
          purchases: 1,
          lastPurchasedAt: item.purchase.receivedAt,
        });
      }
    }
    return [...byProduct.values()];
  }

  async listPurchases(tenantId: string, query: PurchaseListQueryDto) {
    const where = {
      tenantId,
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...((query.from || query.to) && {
        receivedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: endOfDay(new Date(query.to)) }),
        },
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          supplier: { select: { name: true } },
          items: true,
        },
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.purchase.count({ where }),
    ]);

    // A purchase not fully paid upfront gets a linked Debt for the remainder (referenceType:
    // 'purchase') — later payments against that debt (via Loan & Deficit) don't touch the
    // purchase row itself, so merge them back in here.
    const purchaseIds = rows.map((r) => r.id);
    const debts = purchaseIds.length
      ? await this.prisma.debt.findMany({
          where: { tenantId, referenceType: 'purchase', referenceId: { in: purchaseIds } },
          select: { referenceId: true, paidAmount: true, status: true },
        })
      : [];
    const debtByPurchaseId = new Map(debts.map((d) => [d.referenceId, d]));

    const items = rows.map(({ supplier, ...purchase }) => {
      const debt = debtByPurchaseId.get(purchase.id);
      return {
        ...purchase,
        supplierName: supplier.name,
        debtPaidAmount: debt?.paidAmount ?? new Prisma.Decimal(0),
        debtStatus: debt?.status ?? null,
      };
    });
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }
}

/** End of day — so the "to" date filter includes the entire day */
function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}
