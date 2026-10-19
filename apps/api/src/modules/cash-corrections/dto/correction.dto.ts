import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TRANSACTION_EDITING_WINDOWS, type TransactionEditingWindow } from '@my-store/shared';

const MAX_CASH_AMOUNT = 10_000_000_000;

export class CorrectTransactionDto {
  /** Client-generated key — a retried request with the same key is applied once */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  requestId: string;

  /** The version the admin saw — a correction made meanwhile by someone else is refused */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_CASH_AMOUNT)
  amount?: number;

  /** The business date (store calendar day, YYYY-MM-DD); the time of day is kept */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  /** Move it to another account of the same branch */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  registerId?: string;

  /** The description; an empty string clears it */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** A single-use Admin Exception, when outside the editing window */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  grantId?: string;
}

export class RequestExceptionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;

  /** Required when the admin has 2-step verification on */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  totpCode?: string;
}

export class SetEditingWindowDto {
  @IsIn(TRANSACTION_EDITING_WINDOWS as unknown as string[])
  window: TransactionEditingWindow;
}
