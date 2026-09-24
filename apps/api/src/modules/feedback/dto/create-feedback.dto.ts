import { IsIn, IsString, MinLength } from 'class-validator';
import { PLATFORM_FEEDBACK_TYPES, PlatformFeedbackType } from '@my-store/shared';

export class CreateFeedbackDto {
  @IsIn(PLATFORM_FEEDBACK_TYPES)
  type!: PlatformFeedbackType;

  @IsString()
  @MinLength(3)
  subject!: string;

  @IsString()
  @MinLength(5)
  body!: string;
}
