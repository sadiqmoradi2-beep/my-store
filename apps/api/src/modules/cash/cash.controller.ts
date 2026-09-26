import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CashTransactionListQueryDto, CreateCashTransactionDto, IncomeSummaryQueryDto } from './dto/cash.dto';
import { CashService } from './cash.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('cash-registers')
@ApiBearerAuth()
@Controller('cash-registers')
@RequireModule('cash-register')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CASH_READ)
  list(@TenantId() tenantId: string, @Query('branchId') branchId?: string) {
    return this.cashService.listRegisters(tenantId, branchId);
  }

  /** Income overview: Cash / EBT / Zelle parts + totals */
  @Get('income-summary')
  @RequirePermissions(PERMISSIONS.CASH_READ)
  incomeSummary(@TenantId() tenantId: string, @Query() query: IncomeSummaryQueryDto) {
    return this.cashService.incomeSummary(tenantId, query);
  }

  @Get(':id/transactions')
  @RequirePermissions(PERMISSIONS.CASH_READ)
  transactions(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query() query: CashTransactionListQueryDto,
  ) {
    return this.cashService.listTransactions(tenantId, id, query);
  }

  @Post(':id/transactions')
  @RequirePermissions(PERMISSIONS.CASH_TRANSACT)
  createTransaction(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateCashTransactionDto,
  ) {
    return this.cashService.createTransaction(tenantId, user.userId, id, dto);
  }
}
