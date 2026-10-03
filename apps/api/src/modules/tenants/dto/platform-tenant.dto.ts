import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class SetTenantAccessDto {
  /** false = the store's users can no longer log in (data is kept); true = access restored */
  @IsBoolean()
  active: boolean;
}

export class DeleteTenantDto {
  /** The store's slug, typed by the platform admin to confirm a permanent delete */
  @IsString()
  @MinLength(1)
  confirm: string;

  /** The platform admin's own password — second confirmation step */
  @IsString()
  @MinLength(1)
  password: string;
}

export class ChangeTenantPlanDto {
  @IsIn(['FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE'])
  planCode: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  billingCycle?: 'MONTHLY' | 'YEARLY';
}

export class TenantActivityQueryDto extends PaginationQueryDto {
  /** admins = the store's ADMIN logins; staff = everyone else */
  @IsOptional()
  @IsIn(['all', 'admins', 'staff'])
  who?: 'all' | 'admins' | 'staff';
}
