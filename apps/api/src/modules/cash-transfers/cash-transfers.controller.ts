import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CashTransfersService } from './cash-transfers.service';
import { FinancialAccessService } from '../../common/financial-access.service';
import { CreateTransferDto, ReverseTransferDto, TransferListQueryDto } from './dto/transfer.dto';

/** Internal transfers between the store's own accounts (Cash / EBT / Zelle / cards) */
@ApiTags('cash-transfers')
@ApiBearerAuth()
@Controller('cash-transfers')
@RequireModule('cash-register')
export class CashTransfersController {
  constructor(
    private readonly service: CashTransfersService,
    private readonly access: FinancialAccessService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CASH_READ)
  list(@TenantId() tenantId: string, @Query() query: TransferListQueryDto) {
    return this.service.list(tenantId, query);
  }

  /** cash.manage, or the cash.transfer.create capability (Financial Personnel logins: own branch only) */
  @Post()
  @RequirePermissions(PERMISSIONS.CASH_READ)
  async create(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateTransferDto) {
    await this.access.assertTransfer(user);
    await this.access.assertBranchScope(tenantId, user.userId, [dto.fromRegisterId, dto.toRegisterId]);
    return this.service.create(tenantId, user.userId, dto);
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  reverse(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReverseTransferDto) {
    return this.service.reverse(tenantId, user.userId, id, dto);
  }
}
