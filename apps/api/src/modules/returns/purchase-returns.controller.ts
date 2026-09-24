import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';
import { PurchaseReturnsService } from './purchase-returns.service';

@ApiTags('purchase-returns')
@ApiBearerAuth()
@Controller('purchase-returns')
@RequireModule('returns')
export class PurchaseReturnsController {
  constructor(private readonly service: PurchaseReturnsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RETURNS_READ)
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.service.list(tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RETURNS_CREATE)
  create(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: CreatePurchaseReturnDto) {
    return this.service.create(tenantId, user.userId, dto);
  }
}
