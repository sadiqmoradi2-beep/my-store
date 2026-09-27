import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PAYMENT_METHOD_NAMES, PAYMENT_METHOD_PART } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { findIncomeRegister, recordCashTransaction } from '../cash/cash.service';
import { findDefaultWarehouse } from '../branches/default-warehouse';
import { applyMovement } from '../inventory/inventory.service';
import { notifyLowStock } from '../notifications/notifications.service';
import { recordCommission } from '../sellers/sellers.service';
import { findActiveSessionIdForUser } from '../work-sessions/session-link';
import { PosSaleDto } from '../pos/dto/pos.dto';
import { SaleListQueryDto } from './dto/sale.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const DAY_MS = 86_400_000;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: SaleListQueryDto) {
    const where: Prisma.SaleWhereInput = {
      tenantId,
      ...(query.paymentMethod && { paymentMethod: query.paymentMethod }),
      ...(query.branchId && { branchId: query.branchId }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: endOfDay(new Date(query.to)) }),
        },
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          branch: { select: { name: true } },
          createdBy: { select: { fullName: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { items: rows.map(toSaleDto), meta: paginationMeta(query.page, query.limit, total) };
  }

  async get(tenantId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId },
      include: {
        branch: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        items: true,
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return toSaleDto(sale);
  }

  /**
   * POS checkout — one transaction: the cart becomes a sale, stock is deducted from the branch's default
   * warehouse, and the money lands in its Income part (Cash / EBT / Zelle; Card goes to Zelle).
   * A sale made by a seller who has an active work session belongs to that session.
   */
  async createFromCart(tenantId: string, userId: string, dto: PosSaleDto) {
    const cart = await this.prisma.cart.findFirst({
      where: { id: dto.cartId, tenantId },
      include: { items: { include: { product: { select: { name: true, purchasePrice: true } } } } },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    if (cart.items.length === 0) throw new UnprocessableEntityException('Cart is empty');

    const branch = await this.prisma.branch.findFirst({
      where: { id: cart.branchId, tenantId, isActive: true },
      select: { id: true, name: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const items = cart.items.map((i) => ({
      productId: i.productId,
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      unitCost: i.product.purchasePrice,
      total: i.unitPrice.mul(i.quantity).toDecimalPlaces(2),
    }));
    const total = items.reduce((sum, i) => sum.add(i.total), D(0));
    const cost = items.reduce((sum, i) => sum.add(i.unitCost.mul(i.quantity)), D(0));

    const cashReceived =
      dto.paymentMethod === 'CASH' && dto.cashReceived != null ? D(dto.cashReceived) : null;
    if (cashReceived && cashReceived.lessThan(total)) {
      throw new UnprocessableEntityException(
        `Amount received is less than the sale amount (amount: ${total.toString()})`,
      );
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const warehouse = await findDefaultWarehouse(tx, tenantId, branch);
      const sessionId = await findActiveSessionIdForUser(tx, tenantId, userId);
      const last = await tx.sale.findFirst({
        where: { tenantId },
        orderBy: { saleNumber: 'desc' },
        select: { saleNumber: true },
      });
      const created = await tx.sale.create({
        data: {
          tenantId,
          branchId: cart.branchId,
          saleNumber: (last?.saleNumber ?? 0) + 1,
          total,
          cost,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
          sessionId,
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
          delta: -item.quantity,
          type: 'SALE_OUT',
          referenceType: 'sale',
          referenceId: created.id,
        });
      }
      await notifyLowStock(tx, tenantId, items.map((i) => i.productId), warehouse.id);

      let registerId: string | null = null;
      const part = PAYMENT_METHOD_PART[dto.paymentMethod];
      if (total.greaterThan(0)) {
        registerId = await this.resolveRegister(tx, tenantId, cart.branchId, part, dto.registerId);
        await recordCashTransaction(tx, {
          tenantId,
          userId,
          registerId,
          type: 'SALE',
          amount: total,
          category: PAYMENT_METHOD_NAMES[dto.paymentMethod],
          note: `Sale #${created.saleNumber}`,
          referenceType: 'sale',
          referenceId: created.id,
          sessionId,
        });
      }

      await recordCommission(tx, tenantId, {
        id: created.id,
        saleNumber: created.saleNumber,
        total,
        createdById: userId,
      });

      await tx.cart.delete({ where: { id: cart.id } });
      return tx.sale.update({
        where: { id: created.id },
        data: { registerId },
        include: {
          branch: { select: { name: true } },
          createdBy: { select: { fullName: true } },
          items: true,
        },
      });
    });

    return {
      sale: toSaleDto(sale),
      change: cashReceived ? cashReceived.sub(total) : D(0),
    };
  }

  /** A given register must belong to the tenant and to the Income part of the payment method; otherwise the branch's own register of that part is used */
  private async resolveRegister(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    part: 'CASH' | 'EBT' | 'ZELLE',
    registerId?: string,
  ) {
    if (registerId) {
      const register = await tx.cashRegister.findFirst({
        where: { id: registerId, tenantId, part, isActive: true },
        select: { id: true },
      });
      if (!register) throw new UnprocessableEntityException('Register does not match the payment method');
      return register.id;
    }
    return (await findIncomeRegister(tx, tenantId, branchId, part)).id;
  }
}

function endOfDay(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return new Date(start.getTime() + DAY_MS - 1);
}

type SaleRow = Prisma.SaleGetPayload<{
  include: { branch: { select: { name: true } }; createdBy: { select: { fullName: true } }; items: true };
}>;

function toSaleDto(row: SaleRow) {
  const { branch, createdBy, ...sale } = row;
  return {
    ...sale,
    branchName: branch.name,
    createdByName: createdBy.fullName,
    profit: sale.total.sub(sale.cost),
  };
}
