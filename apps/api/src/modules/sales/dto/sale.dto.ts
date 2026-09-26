import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class SaleListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  /** Range end — the whole day is included */
  @IsOptional()
  @IsDateString()
  to?: string;
}
