import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AutoBackupSettingDto, CreateBackupDto } from './dto/backup.dto';
import { BackupsService } from './backups.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('backups')
@ApiBearerAuth()
@Controller('backups')
@RequirePermissions(PERMISSIONS.BACKUPS_MANAGE)
@RequireModule('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.backupsService.list(tenantId, query);
  }

  @Post()
  create(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateBackupDto) {
    return this.backupsService.create(tenantId, 'MANUAL', user.userId, dto.note);
  }

  @Get('settings')
  getSettings(@TenantId() tenantId: string) {
    return this.backupsService.getAutoSetting(tenantId);
  }

  @Patch('settings')
  setSettings(@TenantId() tenantId: string, @Body() dto: AutoBackupSettingDto) {
    return this.backupsService.setAutoSetting(tenantId, dto.enabled);
  }

  @Get(':id/download')
  async download(@TenantId() tenantId: string, @Param('id') id: string, @Res() res: Response) {
    const { path, fileName } = await this.backupsService.download(tenantId, id);
    res.download(path, fileName);
  }

  @Post(':id/restore')
  restore(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.backupsService.restore(tenantId, id, user.userId);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.backupsService.remove(tenantId, id);
  }
}
