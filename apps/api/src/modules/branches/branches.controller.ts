import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRANCHES_READ)
  list(@TenantId() tenantId: string) {
    return this.branchesService.list(tenantId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_READ)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.branchesService.get(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BRANCHES_CREATE)
  create(@TenantId() tenantId: string, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_UPDATE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_DELETE)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.branchesService.remove(tenantId, id);
  }

  @Post(':id/warehouses')
  @RequirePermissions(PERMISSIONS.BRANCHES_UPDATE)
  createWarehouse(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.branchesService.createWarehouse(tenantId, id, dto);
  }
}
