import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { WipeDataDto } from './dto/wipe-data.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  @RequirePermissions(PERMISSIONS.TENANTS_READ)
  getCurrent(@TenantId() tenantId: string) {
    return this.tenantsService.getCurrent(tenantId);
  }

  @Patch('current')
  @RequirePermissions(PERMISSIONS.TENANTS_UPDATE)
  updateCurrent(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateCurrent(tenantId, dto);
  }

  @Post('current/wipe-data')
  @RequirePermissions(PERMISSIONS.TENANTS_UPDATE)
  wipeData(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: WipeDataDto,
  ) {
    return this.tenantsService.wipeData(tenantId, user.userId, dto);
  }

  /**
   * Full console for platform stores — platform admin only (TENANTS_MANAGE_ALL).
   * Note: must be defined after "current" — since both GET routes share the same prefix
   * on this controller, if ":id" is registered first it will swallow the "/tenants/current" route.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.TENANTS_MANAGE_ALL)
  list(@Query() query: PaginationQueryDto) {
    return this.tenantsService.listAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TENANTS_MANAGE_ALL)
  detail(@Param('id') id: string) {
    return this.tenantsService.detail(id);
  }
}
