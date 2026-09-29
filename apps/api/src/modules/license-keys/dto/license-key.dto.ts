import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PlanCode } from '@my-store/shared';

const PLAN_CODES: PlanCode[] = ['FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE'];

export class CreateLicenseKeyDto {
  /** Free-text label to help the super admin remember who this key was issued to */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  /** Plan the redeeming tenant is provisioned with. Defaults to FREE if omitted. */
  @IsOptional()
  @IsIn(PLAN_CODES)
  planCode?: PlanCode;

  /** Key expires this many days after creation. Omit for a key that never expires. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}
