import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CURRENCIES,
  Currency,
  DEBT_DIRECTIONS,
  DEBT_KINDS,
  DEBT_STATUSES,
  DebtDirection,
  DebtKind,
  DebtStatus,
} from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateDebtDto {
  @IsEnum(DEBT_DIRECTIONS)
  direction: DebtDirection;

  /** Loan = money we borrowed; Deficit = money we owe (default) */
  @IsOptional()
  @IsEnum(DEBT_KINDS)
  kind?: DebtKind;

  /** Loan only: the Income register that received the borrowed money right now — it counts as money in */
  @IsOptional()
  @IsString()
  receivedRegisterId?: string;

  /** Free-form counterparty — filled in automatically if a supplier/employee is selected */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  partyName?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(CURRENCIES)
  currency?: Currency;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Optional receipt / contract photo or PDF (from POST /uploads/payment-proofs) */
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class PayDebtDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** The Income register the money is paid from (payable) or received into (receivable) */
  @IsString()
  registerId: string;

  /** The work session whose cash box paid / received this. Empty = the main cash box; not given = the user's own active session */
  @IsOptional()
  @IsString()
  sessionId?: string | null;

  /** Cheque / payment-proof image or PDF URL — mainly used for supplier payments */
  @IsOptional()
  @IsString()
  proofImageUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class DebtListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DEBT_DIRECTIONS)
  direction?: DebtDirection;

  @IsOptional()
  @IsEnum(DEBT_STATUSES)
  status?: DebtStatus;

  @IsOptional()
  @IsEnum(DEBT_KINDS)
  kind?: DebtKind;

  /** Only open/partial documents that are past their due date */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;
}
