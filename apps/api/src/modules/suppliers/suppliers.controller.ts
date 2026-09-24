import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import {
  CreatePurchaseDto,
  CreateSupplierDto,
  PurchaseListQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
@RequireModule('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  list(@TenantId() tenantId: string) {
    return this.suppliersService.list(tenantId);
  }

  @Get('purchases')
  @RequirePermissions(PERMISSIONS.PURCHASES_READ)
  listPurchases(@TenantId() tenantId: string, @Query() query: PurchaseListQueryDto) {
    return this.suppliersService.listPurchases(tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.suppliersService.remove(tenantId, id);
  }

  @Post('purchases')
  @RequirePermissions(PERMISSIONS.PURCHASES_CREATE)
  createPurchase(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.suppliersService.createPurchase(tenantId, user.userId, dto);
  }
}
