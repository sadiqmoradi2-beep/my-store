import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Optional staff attribution for existing linked payments; never replaces their recipient. */
export class PaymentAttributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @MinLength(1)
  paidByPersonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;
}
