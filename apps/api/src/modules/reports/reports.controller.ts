import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { ReportRangeQueryDto, SalesReportQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@RequirePermissions(PERMISSIONS.REPORTS_VIEW)
@RequireModule('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  sales(@TenantId() tenantId: string, @Query() query: SalesReportQueryDto) {
    return this.reportsService.sales(tenantId, query);
  }

  @Get('products')
  products(@TenantId() tenantId: string, @Query() query: ReportRangeQueryDto) {
    return this.reportsService.products(tenantId, query);
  }

  @Get('cash')
  cash(@TenantId() tenantId: string, @Query() query: ReportRangeQueryDto) {
    return this.reportsService.cash(tenantId, query);
  }

  @Get('branches')
  branches(@TenantId() tenantId: string, @Query() query: ReportRangeQueryDto) {
    return this.reportsService.branches(tenantId, query);
  }

  @Get('sellers')
  sellers(@TenantId() tenantId: string, @Query() query: ReportRangeQueryDto) {
    return this.reportsService.sellers(tenantId, query);
  }
}
