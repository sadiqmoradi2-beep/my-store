import { IsIn, IsOptional, IsString } from 'class-validator';
import { PLATFORM_FEEDBACK_STATUSES, PlatformFeedbackStatus } from '@my-store/shared';

export class UpdateFeedbackDto {
  @IsOptional()
  @IsIn(PLATFORM_FEEDBACK_STATUSES)
  status?: PlatformFeedbackStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
