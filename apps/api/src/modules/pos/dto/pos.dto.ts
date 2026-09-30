import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from '@my-store/shared';

export class PosSaleDto {
  @IsString()
  cartId: string;

  /** Cash / Card / EBT / Zelle / Debit Card — all recorded as immediate income */
  @IsEnum(PAYMENT_METHODS)
  paymentMethod: PaymentMethod;

  /** CASH only: money handed over by the customer; empty = exactly the sale amount */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashReceived?: number;

  /**
   * CASH only: the customer paid a round/fixed amount and no change is given back — the extra
   * (cashReceived − sale total) is kept and lands in the Cash register as income too, instead of
   * being handed back as change. Requires cashReceived.
   */
  @IsOptional()
  @IsBoolean()
  fixedAmount?: boolean;

  /** Optional: a specific register of the payment method's Income part (default: the branch's own) */
  @IsOptional()
  @IsString()
  registerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
