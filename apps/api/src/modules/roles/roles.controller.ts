import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  list(@TenantId() tenantId: string) {
    return this.rolesService.list(tenantId);
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.rolesService.remove(tenantId, id);
  }
}
