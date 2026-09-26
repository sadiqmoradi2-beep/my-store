import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { SaleListQueryDto } from './dto/sale.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_READ)
  list(@TenantId() tenantId: string, @Query() query: SaleListQueryDto) {
    return this.salesService.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.salesService.get(tenantId, id);
  }
}
