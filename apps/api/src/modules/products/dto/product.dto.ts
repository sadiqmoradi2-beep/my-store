import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CURRENCIES, Currency } from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  /** Leave empty to auto-generate a unique SKU */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  promoPrice?: number;

  @IsOptional()
  @IsEnum(CURRENCIES)
  currency?: Currency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  /** Initial purchase at the same time the product is created — the three fields below are optional together */
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  initialQuantity?: number;

  @IsOptional()
  @IsString()
  invoiceImageUrl?: string;

  /** Seed a zero-stock row only in this warehouse instead of every warehouse — for a branch-specific product */
  @IsOptional()
  @IsString()
  stockWarehouseId?: string;

  /** When this batch/product expires — triggers a "close to expiry" alert */
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class UpdateProductDto extends CreateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare name: string;

  @IsOptional()
  @IsString()
  declare sku: string;

  @IsOptional()
  @IsString()
  declare categoryId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declare purchasePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declare salePrice: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  categoryId?: string;
}
