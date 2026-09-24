import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderStatus } from '@my-store/shared';
import { CartsService } from '../carts/carts.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PosSaleDto } from './dto/pos.dto';

/** In-person cash sale: approval and delivery happen at the same moment */
const POS_FLOW: OrderStatus[] = ['APPROVED', 'DELIVERED'];

@Injectable()
export class PosService {
  constructor(
    private readonly carts: CartsService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * POS sale: cart → order, full transition to DELIVERED (stock deduction, purchasing power),
   * full cash payment recording and change calculation.
   */
  async sale(tenantId: string, userId: string, dto: PosSaleDto) {
    const order = await this.carts.checkout(tenantId, userId, dto.cartId, { notes: dto.notes });
    const total = order.total;
    const cashReceived = dto.cashReceived != null ? new Prisma.Decimal(dto.cashReceived) : total;
    if (cashReceived.lessThan(total)) {
      // The order stays PENDING — the cashier can cancel it
      throw new UnprocessableEntityException(
        `Amount received is less than the order amount (amount: ${total.toString()})`,
      );
    }

    for (const toStatus of POS_FLOW) {
      await this.orders.transition(tenantId, userId, order.id, { toStatus });
    }
    const payment = total.greaterThan(0)
      ? await this.payments.create(tenantId, userId, order.id, {
          amount: total.toNumber(),
          registerId: dto.registerId,
        })
      : null;

    const final = await this.orders.get(tenantId, order.id);
    return { order: final, payment, change: cashReceived.sub(total) };
  }
}
