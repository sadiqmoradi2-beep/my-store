import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePurchaseReturnDto {
  @IsString()
  supplierId: string;

  @IsString()
  productId: string;

  @IsString()
  warehouseId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  /** Why the product is being sent back — expired, damaged, wrong item, etc. */
  @IsOptional()
  @IsString()
  note?: string;
}
