import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLicenseKeyDto {
  /** Free-text label to help the super admin remember who this key was issued to */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
