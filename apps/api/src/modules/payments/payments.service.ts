import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { recordCashTransaction } from '../cash/cash.service';
import { CreatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOrder(tenantId: string, orderId: string) {
    await this.findOrder(tenantId, orderId);
    const rows = await this.prisma.payment.findMany({
      where: { orderId },
      include: {
        receivedBy: { select: { fullName: true } },
        register: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ receivedBy, register, ...payment }) => ({
      ...payment,
      receivedByName: receivedBy.fullName,
      registerName: register?.name ?? null,
    }));
  }

  /**
   * Record a payment on an order: Payment + updates paidTotal/paymentStatus;
   * plus a SALE transaction in the register (the branch's default if none is given).
   */
  async create(tenantId: string, userId: string, orderId: string, dto: CreatePaymentDto) {
    const order = await this.findOrder(tenantId, orderId);
    if (order.status === 'CANCELLED') {
      throw new UnprocessableEntityException('A cancelled order cannot be paid');
    }
    const amount = new Prisma.Decimal(dto.amount);
    const remaining = order.total.sub(order.paidTotal);
    if (amount.greaterThan(remaining)) {
      throw new UnprocessableEntityException(
        `Amount exceeds the order's remaining balance (remaining: ${remaining.toString()})`,
      );
    }
    const registerId = await this.resolveRegister(tenantId, order.branchId, dto.registerId);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          orderId,
          amount,
          registerId,
          receivedById: userId,
          note: dto.note,
        },
      });
      await recordCashTransaction(tx, {
        tenantId,
        userId,
        registerId,
        type: 'SALE',
        amount,
        referenceType: 'order',
        referenceId: orderId,
        note: `Payment for order #${order.orderNumber}`,
      });

      const paidTotal = order.paidTotal.add(amount);
      await tx.order.update({
        where: { id: orderId },
        data: {
          paidTotal,
          paymentStatus: paidTotal.lessThan(order.total) ? 'PARTIAL' : 'PAID',
        },
      });
      return payment;
    });
  }

  private async findOrder(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async resolveRegister(tenantId: string, branchId: string, registerId?: string) {
    const register = await this.prisma.cashRegister.findFirst({
      where: registerId
        ? { id: registerId, tenantId }
        : { tenantId, branchId, isDefault: true, isActive: true },
    });
    if (!register) {
      throw new UnprocessableEntityException(
        registerId ? 'Register not found' : 'No active default register exists for the order\'s branch',
      );
    }
    return register.id;
  }
}
