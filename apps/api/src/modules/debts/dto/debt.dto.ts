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
  DEBT_STATUSES,
  DebtDirection,
  DebtStatus,
} from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateDebtDto {
  @IsEnum(DEBT_DIRECTIONS)
  direction: DebtDirection;

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
}

export class PayDebtDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** Register — empty = no register effect */
  @IsOptional()
  @IsString()
  registerId?: string;

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

  /** Only open/partial documents that are past their due date */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;
}
