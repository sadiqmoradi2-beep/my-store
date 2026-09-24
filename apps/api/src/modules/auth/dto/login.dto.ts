import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  /** 6-digit 2FA code — only when the user has enabled it */
  @IsOptional()
  @IsString()
  totpCode?: string;
}
