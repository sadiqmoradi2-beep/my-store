import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  storeName: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug: only lowercase Latin letters, digits, and hyphens' })
  @MinLength(3)
  @MaxLength(50)
  slug: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** One-time activation key issued by the platform super admin */
  @IsString()
  @MinLength(4)
  licenseKey: string;
}
