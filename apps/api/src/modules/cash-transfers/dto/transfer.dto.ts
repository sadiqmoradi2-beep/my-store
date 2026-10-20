import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const MAX_CASH_AMOUNT = 10_000_000_000;

export class CreateTransferDto {
  /** Client-generated key — a retried request creates the transfer once */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  requestId: string;

  @IsString()
  @MaxLength(64)
  fromRegisterId: string;

  @IsString()
  @MaxLength(64)
  toRegisterId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_CASH_AMOUNT)
  amount: number;

  /** Team → Financial Personnel: who moved the money */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @MinLength(1)
  transferredById?: string;

  /** Business date — empty for now; a past date back-fills (no future dates) */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReverseTransferDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  requestId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class TransferListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  registerId?: string;
}
