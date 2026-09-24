import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** Empty = the order's branch default register */
  @IsOptional()
  @IsString()
  registerId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
