import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RESET_SCOPES, ResetScope } from '@my-store/shared';

export class WipeDataDto {
  @IsString()
  password: string;

  /** Must be typed exactly as "DELETE ALL" */
  @IsString()
  confirm: string;

  /** Which data to delete — omit or "ALL" for a full reset */
  @IsOptional()
  @IsEnum(RESET_SCOPES)
  scope?: ResetScope;
}
