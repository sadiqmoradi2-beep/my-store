import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationsService } from './notifications.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

/** The user's own notifications — authentication only */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@RequireModule('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: PaginationQueryDto) {
    return this.notificationsService.listMine(user.userId, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: RequestUser) {
    return this.notificationsService.unreadCount(user.userId);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(user.userId);
  }
}
