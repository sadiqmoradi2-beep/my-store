import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CAPITAL_ENTRY_TYPES, CapitalEntryType, CURRENCIES, Currency } from '@my-store/shared';

export class CreateSeasonDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  /** Season start date — defaults to now if omitted */
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCapital?: number;

  /** Cash on hand — separate from total capital */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCash?: number;

  @IsOptional()
  @IsEnum(CURRENCIES)
  currency?: Currency;
}

export class CreateCapitalEntryDto {
  @IsEnum(CAPITAL_ENTRY_TYPES)
  type: CapitalEntryType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}
