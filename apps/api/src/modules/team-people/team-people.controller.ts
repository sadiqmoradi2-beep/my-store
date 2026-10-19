import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FINANCIAL_PERSONNEL_CAPABILITIES, PERMISSIONS } from '@my-store/shared';
import { FinancialAccessService } from '../../common/financial-access.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { CreatePersonAccountDto, CreateTeamPersonDto, UpdatePersonAccountDto, UpdateTeamPersonDto } from './dto/team-person.dto';
import { TeamPersonAccountService } from './team-person-account.service';
import { TeamPeopleService } from './team-people.service';

@ApiTags('team-people')
@ApiBearerAuth()
@Controller('team-people')
export class TeamPeopleController {
  constructor(
    private readonly service: TeamPeopleService,
    private readonly access: FinancialAccessService,
    private readonly accounts: TeamPersonAccountService,
  ) {}

  /** Everyone selectable as Paid By / Who Is Paid — needed by whoever records Cash transactions */
  @Get('directory')
  @RequirePermissions(PERMISSIONS.CASH_READ)
  async directory(@TenantId() tenantId: string, @CurrentUser() user: RequestUser) {
    await this.access.assertAny(user, [PERMISSIONS.CASH_TRANSACT, PERMISSIONS.CASH_MANAGE, ...FINANCIAL_PERSONNEL_CAPABILITIES], 'record transactions');
    return this.service.directory(tenantId);
  }

  @Get()
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  list(@TenantId() tenantId: string, @CurrentUser() user: RequestUser) {
    return this.service.list(tenantId, user.userId);
  }

  @Post()
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  create(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateTeamPersonDto) {
    return this.service.create(tenantId, dto, user.userId);
  }

  @Patch(':id')
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateTeamPersonDto) {
    return this.service.update(tenantId, id, dto);
  }

  /** Real Store Admin only (checked in the service): hard delete when unreferenced, otherwise archive */
  @Delete(':id')
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  remove(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(tenantId, user.userId, id);
  }

  /** Login accounts — real Store Admin only (checked in the service) */
  @Post(':id/account')
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  createAccount(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreatePersonAccountDto) {
    return this.accounts.create(tenantId, user.userId, id, dto);
  }

  @Patch(':id/account')
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  updateAccount(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePersonAccountDto) {
    return this.accounts.update(tenantId, user.userId, id, dto);
  }

  @Post(':id/account/invite')
  @RequireModule('employees')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  resendInvite(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accounts.resendInvite(tenantId, user.userId, id);
  }
}
