import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class StockInDto {
  @IsString()
  productId: string;

  @IsString()
  warehouseId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StockOutDto extends StockInDto {}

export class StockAdjustDto {
  @IsString()
  productId: string;

  @IsString()
  warehouseId: string;

  /** Final stock quantity after the adjustment */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  newQuantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StockTransferDto {
  @IsString()
  productId: string;

  @IsString()
  fromWarehouseId: string;

  @IsString()
  toWarehouseId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;

  /** Receipt image — for a warehouse request (optional) */
  @IsOptional()
  @IsString()
  receiptImageUrl?: string;
}
