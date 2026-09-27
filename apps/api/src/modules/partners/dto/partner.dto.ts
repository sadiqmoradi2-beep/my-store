import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PARTNER_ENTRY_TYPES, PartnerEntryType } from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreatePartnerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Ownership/profit-share percentage (0–100) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  sharePercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  sharePercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  isActive?: boolean;
}

export class CreateLedgerEntryDto {
  @IsEnum(PARTNER_ENTRY_TYPES)
  type: PartnerEntryType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  /** e.g. "2026-09" — the period this distribution covers */
  @IsOptional()
  @IsString()
  period?: string;

  /** How this amount was calculated — shown alongside the entry for transparency */
  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Cash register to deduct from — only meaningful for WITHDRAWAL (an actual cash payout); ignored otherwise */
  @IsOptional()
  @IsString()
  registerId?: string;

  /** The work session whose cash box paid / received this. Empty = the main cash box; not given = the user's own active session */
  @IsOptional()
  @IsString()
  sessionId?: string | null;
}

/** Preview/apply an even distribution of a total profit or loss figure across active partners, by sharePercent */
export class DistributeProfitDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount: number;

  @IsEnum(['PROFIT', 'LOSS'])
  type: 'PROFIT' | 'LOSS';

  @IsOptional()
  @IsString()
  period?: string;
}

export class PartnerLedgerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  partnerId?: string;
}
