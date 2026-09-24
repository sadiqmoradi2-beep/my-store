import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  canTransition,
  STOCK_RESTORE_STATUSES,
} from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { applyMovement } from '../inventory/inventory.service';
import { accrueNetProfit } from '../cash/cash.service';
import { recordCommission } from '../sellers/sellers.service';
import { notifyLowStock, notifyRoles } from '../notifications/notifications.service';
import { CreateOrderDto, OrderItemInputDto, OrderListQueryDto, TransitionOrderDto } from './dto/order.dto';
import { OrdersRepository } from './orders.repository';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(tenantId: string, query: OrderListQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.repo.findMany(
      tenantId,
      skip,
      query.limit,
      query.status,
      query.branchId,
    );
    const items = rows.map(({ branch, ...order }) => ({
      ...order,
      branchName: branch.name,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async get(tenantId: string, id: string) {
    const order = await this.repo.findById(tenantId, id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Create an order in a single transaction: price/cost snapshot, per-tenant incrementing orderNumber,
   */
  async create(tenantId: string, userId: string, dto: CreateOrderDto) {
    const branch = await this.repo.findBranchWithDefaultWarehouse(tenantId, dto.branchId);
    if (!branch) throw new NotFoundException('Branch not found');
    const items = await this.buildItems(tenantId, dto.items);
    const subtotal = items.reduce((sum, i) => sum.add(i.unitPrice.mul(i.quantity)), D(0));

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.order.findFirst({
        where: { tenantId },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const order = await tx.order.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          orderNumber: (last?.orderNumber ?? 0) + 1,
          subtotal,
          total: subtotal,
          notes: dto.notes,
          createdById: userId,
          items: { create: items },
        },
        include: { items: true },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: 'PENDING', changedById: userId },
      });
      await notifyRoles(tx, tenantId, ['ADMIN', 'BRANCH_MANAGER', 'SALES_MANAGER'], {
        type: 'ORDER_CREATED',
        title: `New order #${order.orderNumber}`,
        body: `Amount ${order.total.toString()} ؋`,
        refType: 'order',
        refId: order.id,
      });
      return order;
    });
  }

  /**
   * Status transition according to the shared state machine.
   * APPROVED: deduct stock from the branch's default warehouse (fully reject on shortage).
   * CANCELLED after approval: restore stock.
   * DELIVERED: accrue purchasing power + net sales profit.
   */
  async transition(tenantId: string, userId: string, id: string, dto: TransitionOrderDto) {
    const order = await this.get(tenantId, id);
    const from = order.status;
    const to = dto.toStatus;
    if (!canTransition(from, to)) {
      throw new UnprocessableEntityException(`Transition ${from} → ${to} is not allowed`);
    }

    const branch = await this.repo.findBranchWithDefaultWarehouse(tenantId, order.branchId);
    const warehouse = branch?.warehouses[0];
    if (!warehouse) {
      throw new UnprocessableEntityException('Default warehouse for the branch not found');
    }

    const deductStock = to === 'APPROVED';
    const restoreStock =
      to === 'CANCELLED' && STOCK_RESTORE_STATUSES.includes(from);

    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const delta = deductStock ? -item.quantity : restoreStock ? item.quantity : 0;
        if (delta === 0) continue;
        await applyMovement(tx, {
          tenantId,
          userId,
          productId: item.productId,
          warehouseId: warehouse.id,
          delta,
          type: deductStock ? 'SALE_OUT' : 'RETURN_IN',
          referenceType: 'order',
          referenceId: order.id,
        });
      }
      if (deductStock) {
        await notifyLowStock(
          tx,
          tenantId,
          order.items.map((i) => i.productId),
          warehouse.id,
        );
      }
      if (to === 'DELIVERED') {
        await accrueNetProfit(tx, tenantId, userId, order);
        await recordCommission(tx, tenantId, order);
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: to as OrderStatus,
          ...(to === 'APPROVED' && { approvedById: userId }),
        },
        include: { items: true },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: from,
          toStatus: to as OrderStatus,
          changedById: userId,
          note: dto.note,
        },
      });
      return updated;
    });
  }

  private async buildItems(tenantId: string, inputs: OrderItemInputDto[]) {
    const productIds = [...new Set(inputs.map((i) => i.productId))];
    if (productIds.length !== inputs.length) {
      throw new BadRequestException('Duplicate product in order items');
    }
    const products = await this.repo.findProductsForOrder(tenantId, productIds);
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const id of productIds) {
      if (!productMap.has(id)) throw new BadRequestException('A product in the order is invalid');
    }
    return inputs.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = D(item.unitPrice ?? product.salePrice);
      const total = unitPrice.mul(item.quantity);
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        unitCost: product.purchasePrice,
        total,
      };
    });
  }
}
