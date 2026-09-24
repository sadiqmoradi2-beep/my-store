import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Branch code: only uppercase Latin letters, digits, - and _' })
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
