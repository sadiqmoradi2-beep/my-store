import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  summary(@TenantId() tenantId: string, @Query('branchId') branchId?: string) {
    return this.dashboardService.summary(tenantId, branchId);
  }
}
