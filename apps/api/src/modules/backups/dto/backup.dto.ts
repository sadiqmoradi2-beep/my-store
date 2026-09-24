import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class AutoBackupSettingDto {
  @IsBoolean()
  enabled!: boolean;
}
