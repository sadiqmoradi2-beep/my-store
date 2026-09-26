import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from '@my-store/shared';

export class PosSaleDto {
  @IsString()
  cartId: string;

  /** Cash / Card / EBT / Zelle are paid now; Loan / Deficit leave the amount unpaid */
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

  /** Loan / Deficit only: who owes the amount */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  partyName?: string;

  /** Loan / Deficit only: when the amount is expected back */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
