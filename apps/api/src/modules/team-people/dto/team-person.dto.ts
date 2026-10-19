import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { FINANCIAL_PERSONNEL_CAPABILITIES } from '@my-store/shared';

/** Optional login for a Financial Personnel member — Store Admin only; the person sets a password via the emailed invite */
export class CreatePersonAccountDto {
  @IsEmail()
  @MaxLength(200)
  email: string;

  /** The branch whose accounts this login may use */
  @IsString()
  @MaxLength(64)
  branchId: string;

  /** Nothing by default (least privilege) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(FINANCIAL_PERSONNEL_CAPABILITIES as unknown as string[], { each: true })
  capabilities?: string[];
}

export class UpdatePersonAccountDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(FINANCIAL_PERSONNEL_CAPABILITIES as unknown as string[], { each: true })
  capabilities?: string[];

  @IsOptional()
  @IsBoolean()
  loginEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;
}

export class CreateTeamPersonDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** "Create Account" checked: also provision a login (Store Admin only) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePersonAccountDto)
  account?: CreatePersonAccountDto;
}

export class UpdateTeamPersonDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Deactivate instead of delete — historical transactions keep pointing at this person */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
