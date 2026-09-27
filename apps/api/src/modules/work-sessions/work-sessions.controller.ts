import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import {
  CloseSessionDto,
  CreateAdjustmentDto,
  CreateHarvestDto,
  DecideHarvestDto,
  ReopenSessionDto,
  SessionListQueryDto,
  SessionReportQueryDto,
  StartSessionDto,
  UpdateSessionDto,
} from './dto/work-session.dto';
import { WorkSessionsService } from './work-sessions.service';

/**
 * Reading endpoints have no fixed permission: a user with sessions.read sees every session,
 * a user with only sessions.read_own sees their own — the service decides.
 */
@ApiTags('work-sessions')
@ApiBearerAuth()
@Controller('work-sessions')
@RequireModule('work-sessions')
export class WorkSessionsController {
  constructor(private readonly sessions: WorkSessionsService) {}

  @Get()
  list(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Query() query: SessionListQueryDto) {
    return this.sessions.list(tenantId, user, query);
  }

  /** The active work session of the logged-in seller / employee, if any */
  @Get('mine')
  mine(@TenantId() tenantId: string, @CurrentUser() user: RequestUser) {
    return this.sessions.mine(tenantId, user);
  }

  @Get('people')
  @RequirePermissions(PERMISSIONS.SESSIONS_MANAGE)
  people(@TenantId() tenantId: string) {
    return this.sessions.people(tenantId);
  }

  @Get('report')
  @RequirePermissions(PERMISSIONS.SESSIONS_READ)
  report(@TenantId() tenantId: string, @Query() query: SessionReportQueryDto) {
    return this.sessions.report(tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SESSIONS_MANAGE)
  start(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: StartSessionDto) {
    return this.sessions.start(tenantId, user.userId, dto);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sessions.get(tenantId, user, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SESSIONS_MANAGE)
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessions.update(tenantId, user.userId, id, dto);
  }

  @Get(':id/timeline')
  timeline(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sessions.timeline(tenantId, user, id);
  }

  @Get(':id/audit')
  audit(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sessions.audit(tenantId, user, id);
  }

  @Get(':id/harvests')
  harvests(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sessions.harvests(tenantId, user, id);
  }

  @Post(':id/harvests')
  createHarvest(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateHarvestDto,
  ) {
    return this.sessions.createHarvest(tenantId, user, id, dto);
  }

  @Post(':id/harvests/:harvestId/approve')
  @RequirePermissions(PERMISSIONS.SESSIONS_HARVEST)
  approveHarvest(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('harvestId') harvestId: string,
  ) {
    return this.sessions.approveHarvest(tenantId, user, id, harvestId);
  }

  @Post(':id/harvests/:harvestId/reject')
  @RequirePermissions(PERMISSIONS.SESSIONS_HARVEST)
  rejectHarvest(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('harvestId') harvestId: string,
    @Body() dto: DecideHarvestDto,
  ) {
    return this.sessions.rejectHarvest(tenantId, user.userId, id, harvestId, dto);
  }

  @Get(':id/adjustments')
  adjustments(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sessions.adjustments(tenantId, user, id);
  }

  @Post(':id/adjustments')
  @RequirePermissions(PERMISSIONS.SESSIONS_OVERRIDE)
  adjust(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.sessions.adjust(tenantId, user.userId, id, dto);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.SESSIONS_MANAGE)
  close(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
  ) {
    return this.sessions.close(tenantId, user.userId, id, dto);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.SESSIONS_OVERRIDE)
  reopen(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReopenSessionDto,
  ) {
    return this.sessions.reopen(tenantId, user.userId, id, dto);
  }
}
