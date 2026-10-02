import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  INCOME_PARTS,
  IncomePart,
  SESSION_ROLES,
  SESSION_STATUSES,
  SessionRole,
  SessionStatus,
} from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Sanity cap on a session amount — guards against a typo (extra digit) */
const MAX_AMOUNT = 10_000_000_000;

export class StartSessionDto {
  // Sellers are managed as employees now — new sessions are for employees and partners only
  @IsIn(['EMPLOYEE', 'PARTNER'])
  role: SessionRole;

  /** The seller profile / employee / partner id, depending on the role */
  @IsString()
  personId: string;

  /** Start date and time (ISO) — not in the future */
  @IsDateString()
  startedAt: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  openingCash: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  harvestLimit: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  openingNotes?: string;
}

/** Opening cash is not editable — a correction is a separate audited adjustment */
export class UpdateSessionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  harvestLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  openingNotes?: string;

  /** Why the change was made — saved in the audit history */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CreateHarvestDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  amount: number;

  /** How the money was handed over: cash from the box, or a Zelle / EBT transfer */
  @IsOptional()
  @IsEnum(INCOME_PARTS)
  method?: IncomePart;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Defaults to now */
  @IsOptional()
  @IsDateString()
  harvestedAt?: string;
}

export class DecideHarvestDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CreateAdjustmentDto {
  /** Signed: positive adds cash to the box, negative removes cash */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-MAX_AMOUNT)
  @Max(MAX_AMOUNT)
  amount: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class CloseSessionDto {
  /** Defaults to now; not before the start and not in the future */
  @IsOptional()
  @IsDateString()
  closedAt?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  actualClosingCash: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  closingNotes?: string;
}

export class ReopenSessionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class SessionListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SESSION_STATUSES)
  status?: SessionStatus;

  @IsOptional()
  @IsEnum(SESSION_ROLES)
  role?: SessionRole;

  /** Only with role: the seller profile / employee / partner id */
  @IsOptional()
  @IsString()
  personId?: string;

  /** Session id (SES-2026-0001) or person name */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SessionReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
