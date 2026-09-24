import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;
}
