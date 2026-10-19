import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateTeamPersonDto, UpdateTeamPersonDto } from './dto/team-person.dto';
import { TeamPeopleService } from './team-people.service';

@ApiTags('team-people')
@ApiBearerAuth()
@Controller('team-people')
export class TeamPeopleController {
  constructor(private readonly service: TeamPeopleService) {}

  /** Everyone selectable as Paid By / Who Is Paid — needed by whoever records Cash transactions */
  @Get('directory')
  @RequirePermissions(PERMISSIONS.CASH_TRANSACT)
  directory(@TenantId() tenantId: string) {
    return this.service.directory(tenantId);
  }

  @Get()
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  list(@TenantId() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Post()
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateTeamPersonDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(':id')
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateTeamPersonDto) {
    return this.service.update(tenantId, id, dto);
  }
}
