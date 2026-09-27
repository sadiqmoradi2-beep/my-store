import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SELLER_PAY_TYPES, SellerPayType } from '@my-store/shared';

export class CreateSellerDto {
  /** Promote an existing user to seller — mutually exclusive with fullName+email (creates a new account) */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(SELLER_PAY_TYPES)
  payType?: SellerPayType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fixedSalaryAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSellerDto {
  @IsOptional()
  @IsEnum(SELLER_PAY_TYPES)
  payType?: SellerPayType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fixedSalaryAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PaySellerSalaryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** Salary period — e.g. "1405-04" */
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  period: string;

  @IsOptional()
  @IsString()
  registerId?: string;

  /** The work session whose cash box paid / received this. Empty = the main cash box; not given = the user's own active session */
  @IsOptional()
  @IsString()
  sessionId?: string | null;

  /** Optional pay slip / receipt image or PDF */
  @IsOptional()
  @IsString()
  receiptImageUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
