import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmGatewayIntentDto, CreateGatewayIntentDto } from './dto/payment-gateway.dto';

@Injectable()
export class PaymentGatewayService {
  constructor(private readonly prisma: PrismaService) {}

  async createIntent(tenantId: string, userId: string, dto: CreateGatewayIntentDto) {
    return this.prisma.gatewayIntent.create({
      data: {
        tenantId,
        purpose: dto.purpose,
        referenceId: dto.referenceId,
        provider: dto.provider,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'USDT',
        meta: dto.meta as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
  }

  async getIntent(tenantId: string, id: string) {
    const intent = await this.prisma.gatewayIntent.findFirst({ where: { id, tenantId } });
    if (!intent) throw new NotFoundException('Payment not found');
    return intent;
  }

  /**
   * mock: confirm payment — in the absence of a real gateway, this manual action stands in for
   * the gateway's callback/webhook; it can later be replaced with automatic webhook confirmation
   * without changing consumers (assertPaid).
   */
  async confirmIntent(tenantId: string, id: string, dto: ConfirmGatewayIntentDto) {
    const intent = await this.getIntent(tenantId, id);
    if (intent.status === 'PAID') return intent;
    if (intent.status !== 'PENDING') {
      throw new BadRequestException('This payment can no longer be confirmed');
    }
    return this.prisma.gatewayIntent.update({
      where: { id },
      data: { status: 'PAID', providerRef: dto.providerRef, confirmedAt: new Date() },
    });
  }
}

/** Verify that an intent for a given amount is actually PAID — before finalizing a subscription */
export async function assertPaid(
  prisma: PrismaService,
  tenantId: string,
  intentId: string,
  expectedAmount: Prisma.Decimal,
): Promise<void> {
  const intent = await prisma.gatewayIntent.findFirst({ where: { id: intentId, tenantId } });
  if (!intent) throw new NotFoundException('Online payment not found');
  if (intent.status !== 'PAID') {
    throw new BadRequestException('The online payment has not been confirmed yet');
  }
  if (!intent.amount.equals(expectedAmount)) {
    throw new BadRequestException('The online payment amount does not match the plan price');
  }
}
