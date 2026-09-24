import { IsIn, IsOptional } from 'class-validator';
import { PLATFORM_FEEDBACK_STATUSES, PLATFORM_FEEDBACK_TYPES, PlatformFeedbackStatus, PlatformFeedbackType } from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListFeedbackQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PLATFORM_FEEDBACK_STATUSES)
  status?: PlatformFeedbackStatus;

  @IsOptional()
  @IsIn(PLATFORM_FEEDBACK_TYPES)
  type?: PlatformFeedbackType;
}
