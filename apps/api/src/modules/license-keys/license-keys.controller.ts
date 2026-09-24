import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateLicenseKeyDto } from './dto/license-key.dto';
import { LicenseKeysService } from './license-keys.service';

/** Platform super-admin only — generates the one-time keys new stores need to self-register */
@ApiTags('license-keys')
@ApiBearerAuth()
@Controller('license-keys')
export class LicenseKeysController {
  constructor(private readonly licenseKeysService: LicenseKeysService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TENANTS_MANAGE_ALL)
  list() {
    return this.licenseKeysService.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TENANTS_MANAGE_ALL)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateLicenseKeyDto) {
    return this.licenseKeysService.create(user.userId, dto);
  }

  @Patch(':id/revoke')
  @RequirePermissions(PERMISSIONS.TENANTS_MANAGE_ALL)
  revoke(@Param('id') id: string) {
    return this.licenseKeysService.revoke(id);
  }
}
