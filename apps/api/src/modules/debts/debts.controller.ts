import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateDebtDto, DebtListQueryDto, PayDebtDto } from './dto/debt.dto';
import { DebtsService } from './debts.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('debts')
@ApiBearerAuth()
@Controller('debts')
@RequireModule('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DEBTS_READ)
  list(@TenantId() tenantId: string, @Query() query: DebtListQueryDto) {
    return this.debtsService.list(tenantId, query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DEBTS_READ)
  summary(@TenantId() tenantId: string) {
    return this.debtsService.summary(tenantId);
  }

  @Get('by-supplier/:supplierId')
  @RequirePermissions(PERMISSIONS.DEBTS_READ)
  bySupplier(@TenantId() tenantId: string, @Param('supplierId') supplierId: string) {
    return this.debtsService.bySupplier(tenantId, supplierId);
  }

  @Get('by-employee/:employeeId')
  @RequirePermissions(PERMISSIONS.DEBTS_READ)
  byEmployee(@TenantId() tenantId: string, @Param('employeeId') employeeId: string) {
    return this.debtsService.byEmployee(tenantId, employeeId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DEBTS_READ)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.debtsService.get(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEBTS_MANAGE)
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDebtDto,
  ) {
    return this.debtsService.create(tenantId, user.userId, dto);
  }

  @Post(':id/payments')
  @RequirePermissions(PERMISSIONS.DEBTS_MANAGE)
  pay(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: PayDebtDto,
  ) {
    return this.debtsService.pay(tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DEBTS_MANAGE)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.debtsService.remove(tenantId, id);
  }
}
