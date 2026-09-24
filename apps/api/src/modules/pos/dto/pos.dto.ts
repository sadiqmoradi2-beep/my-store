import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PosSaleDto {
  @IsString()
  cartId: string;

  /** Cash handed over by the customer; empty = exactly the order amount */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashReceived?: number;

  @IsOptional()
  @IsString()
  registerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
