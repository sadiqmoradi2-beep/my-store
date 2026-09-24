import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ListFeedbackQueryDto } from './dto/list-feedback-query.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /** Submit feedback — any store employee/manager, no specific permission required */
  @Post()
  create(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(tenantId, user.userId, dto);
  }

  /** Feedback submitted by this store */
  @Get('mine')
  mine(@TenantId() tenantId: string, @Query() query: ListFeedbackQueryDto) {
    return this.feedbackService.listMine(tenantId, query);
  }

  /** List of all platform feedback — platform admin only */
  @Get()
  @RequirePermissions(PERMISSIONS.FEEDBACK_MANAGE)
  list(@Query() query: ListFeedbackQueryDto) {
    return this.feedbackService.listAll(query);
  }

  /** Change status/internal note — platform admin only */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FEEDBACK_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    return this.feedbackService.update(id, dto);
  }
}
