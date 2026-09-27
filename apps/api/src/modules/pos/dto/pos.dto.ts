import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from '@my-store/shared';

export class PosSaleDto {
  @IsString()
  cartId: string;

  /** Cash / Card / EBT / Zelle — Loan and Deficit are handled only in Loan & Deficit */
  @IsEnum(PAYMENT_METHODS)
  paymentMethod: PaymentMethod;

  /** CASH only: money handed over by the customer; empty = exactly the sale amount */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashReceived?: number;

  /** Optional: a specific register of the payment method's Income part (default: the branch's own) */
  @IsOptional()
  @IsString()
  registerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
