import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TenantModulesService } from './tenant-modules.service';

class SetModuleEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags('modules')
@ApiBearerAuth()
@Controller('modules')
export class TenantModulesController {
  constructor(private readonly tenantModulesService: TenantModulesService) {}

  /** For hiding the menu — all staff */
  @Get('enabled')
  enabled(@TenantId() tenantId: string) {
    return this.tenantModulesService.enabledKeys(tenantId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.MODULES_MANAGE)
  list(@TenantId() tenantId: string) {
    return this.tenantModulesService.list(tenantId);
  }

  @Patch(':key')
  @RequirePermissions(PERMISSIONS.MODULES_MANAGE)
  setEnabled(
    @TenantId() tenantId: string,
    @Param('key') key: string,
    @Body() dto: SetModuleEnabledDto,
  ) {
    return this.tenantModulesService.setEnabled(tenantId, key, dto.enabled);
  }
}
