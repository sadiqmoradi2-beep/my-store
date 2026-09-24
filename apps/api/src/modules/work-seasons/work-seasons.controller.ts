import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateCapitalEntryDto, CreateSeasonDto } from './dto/work-season.dto';
import { WorkSeasonsService } from './work-seasons.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('work-seasons')
@ApiBearerAuth()
@Controller('work-seasons')
@RequireModule('work-season')
export class WorkSeasonsController {
  constructor(private readonly workSeasonsService: WorkSeasonsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SEASONS_READ)
  list(@TenantId() tenantId: string) {
    return this.workSeasonsService.list(tenantId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SEASONS_READ)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workSeasonsService.get(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SEASONS_MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateSeasonDto) {
    return this.workSeasonsService.create(tenantId, dto);
  }

  @Post(':id/entries')
  @RequirePermissions(PERMISSIONS.SEASONS_MANAGE)
  addEntry(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateCapitalEntryDto,
  ) {
    return this.workSeasonsService.addEntry(tenantId, user.userId, id, dto);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.SEASONS_MANAGE)
  close(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workSeasonsService.close(tenantId, id);
  }
}
