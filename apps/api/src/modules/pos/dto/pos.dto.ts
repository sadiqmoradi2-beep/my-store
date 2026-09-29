import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from '@my-store/shared';

export class PosSaleDto {
  @IsString()
  cartId: string;

  /** Cash / Card / EBT / Zelle / Debt (sold on credit — no money received yet) */
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

  /** DEBT only: who owes the store this amount — becomes the Debt record's party name */
  @ValidateIf((dto) => dto.paymentMethod === 'DEBT')
  @IsString()
  debtPartyName?: string;

  /** DEBT only: optional due date for the resulting Debt record */
  @IsOptional()
  @IsString()
  debtDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
