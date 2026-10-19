import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A Kabul calendar-day range, both ends inclusive: YYYY-MM-DD */
export class WorkIntervalRangeDto {
  @Matches(DAY, { message: 'from must be a date (YYYY-MM-DD)' })
  from: string;

  @Matches(DAY, { message: 'to must be a date (YYYY-MM-DD)' })
  to: string;
}

export class ApproveIntervalDto {
  /** Payable minutes — omit to approve the recorded minutes as-is */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_080)
  approvedMinutes?: number;

  /** Required when the minutes differ from what was recorded (a correction) */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class RejectIntervalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class HourlyPayDto extends WorkIntervalRangeDto {
  /** Exactly the stretches shown in the preview — the payment is refused if any of them changed meanwhile */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  intervalIds: string[];

  /** Income account the salary is paid from — empty = record the payment without a cash effect */
  @IsOptional()
  @IsString()
  registerId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  receiptImageUrl?: string;
}
