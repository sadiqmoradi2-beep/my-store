import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ORDER_STATUSES,
  OrderStatus,
} from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class OrderItemInputDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  /** Default: the product's current sale price */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}

export class CreateOrderDto {
  @IsString()
  branchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}

export class TransitionOrderDto {
  @IsEnum(ORDER_STATUSES)
  toStatus: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class OrderListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ORDER_STATUSES)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  branchId?: string;
}
