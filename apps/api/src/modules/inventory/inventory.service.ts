import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { notifyLowStock } from '../notifications/notifications.service';
import { StockAdjustDto, StockInDto, StockOutDto, StockTransferDto } from './dto/inventory.dto';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    private readonly repo: InventoryRepository,
    private readonly prisma: PrismaService,
  ) {}

  async stocks(tenantId: string, warehouseId?: string) {
    const rows = await this.repo.findStocks(tenantId, warehouseId);
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      productSku: row.product.sku,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouse.name,
      quantity: row.quantity,
      minStockLevel: row.product.minStockLevel,
    }));
  }

  lowStocks(tenantId: string) {
    return this.repo.findLowStocks(tenantId);
  }

  async movements(tenantId: string, query: PaginationQueryDto & { productId?: string }) {
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.repo.findMovements(tenantId, skip, query.limit, query.productId);
    const items = rows.map(({ product, warehouse, performedBy, ...m }) => ({
      ...m,
      productName: product.name,
      productSku: product.sku,
      warehouseName: warehouse.name,
      performedByName: performedBy.fullName,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async stockIn(tenantId: string, userId: string, dto: StockInDto) {
    await this.assertRefs(tenantId, dto.productId, dto.warehouseId);
    return this.prisma.$transaction(async (tx) => {
      const result = await applyMovement(tx, {
        tenantId,
        userId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        delta: dto.quantity,
        type: 'PURCHASE_IN',
        reason: dto.reason,
      });
      await notifyLowStock(tx, tenantId, [dto.productId], dto.warehouseId);
      return result;
    });
  }

  async stockOut(tenantId: string, userId: string, dto: StockOutDto) {
    await this.assertRefs(tenantId, dto.productId, dto.warehouseId);
    return this.prisma.$transaction(async (tx) => {
      const result = await applyMovement(tx, {
        tenantId,
        userId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        delta: -dto.quantity,
        type: 'SALE_OUT',
        reason: dto.reason,
      });
      await notifyLowStock(tx, tenantId, [dto.productId], dto.warehouseId);
      return result;
    });
  }

  async adjust(tenantId: string, userId: string, dto: StockAdjustDto) {
    await this.assertRefs(tenantId, dto.productId, dto.warehouseId);
    return this.prisma.$transaction(async (tx) => {
      const stock = await getOrCreateStock(tx, tenantId, dto.productId, dto.warehouseId);
      const delta = dto.newQuantity - stock.quantity;
      if (delta === 0) return stock;
      const result = await applyMovement(tx, {
        tenantId,
        userId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        delta,
        type: 'ADJUSTMENT',
        reason: dto.reason,
      });
      await notifyLowStock(tx, tenantId, [dto.productId], dto.warehouseId);
      return result;
    });
  }

  /** Atomic transfer between two warehouses — two movements paired by a shared transferId */
  async transfer(tenantId: string, userId: string, dto: StockTransferDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouse are the same');
    }
    await this.assertRefs(tenantId, dto.productId, dto.fromWarehouseId);
    if (!(await this.repo.findWarehouse(tenantId, dto.toWarehouseId))) {
      throw new NotFoundException('Destination warehouse not found');
    }

    const transferId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      await applyMovement(tx, {
        tenantId,
        userId,
        productId: dto.productId,
        warehouseId: dto.fromWarehouseId,
        delta: -dto.quantity,
        type: 'TRANSFER_OUT',
        reason: dto.reason,
        transferId,
        receiptImageUrl: dto.receiptImageUrl,
      });
      const destination = await applyMovement(tx, {
        tenantId,
        userId,
        productId: dto.productId,
        warehouseId: dto.toWarehouseId,
        delta: dto.quantity,
        type: 'TRANSFER_IN',
        reason: dto.reason,
        transferId,
        receiptImageUrl: dto.receiptImageUrl,
      });
      await notifyLowStock(tx, tenantId, [dto.productId], dto.fromWarehouseId);
      return { transferId, destination };
    });
  }

  private async assertRefs(tenantId: string, productId: string, warehouseId: string) {
    if (!(await this.repo.findProduct(tenantId, productId))) {
      throw new NotFoundException('Product not found');
    }
    if (!(await this.repo.findWarehouse(tenantId, warehouseId))) {
      throw new NotFoundException('Warehouse not found');
    }
  }
}

interface MovementInput {
  tenantId: string;
  userId: string;
  productId: string;
  warehouseId: string;
  delta: number;
  type: StockMovementType;
  reason?: string;
  transferId?: string;
  referenceType?: string;
  referenceId?: string;
  receiptImageUrl?: string;
}

async function getOrCreateStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productId: string,
  warehouseId: string,
) {
  return tx.stock.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { tenantId, productId, warehouseId, quantity: 0 },
    update: {},
  });
}

/** Apply a stock movement: rejects the transaction if it would go negative */
export async function applyMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  const stock = await getOrCreateStock(tx, input.tenantId, input.productId, input.warehouseId);
  const newQuantity = stock.quantity + input.delta;
  if (newQuantity < 0) {
    throw new UnprocessableEntityException(
      `Insufficient stock (available: ${stock.quantity}, requested: ${-input.delta})`,
    );
  }
  const updated = await tx.stock.update({
    where: { id: stock.id },
    data: { quantity: newQuantity },
  });
  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: Math.abs(input.delta),
      reason: input.reason,
      transferId: input.transferId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      receiptImageUrl: input.receiptImageUrl,
      performedById: input.userId,
    },
  });
  return updated;
}
