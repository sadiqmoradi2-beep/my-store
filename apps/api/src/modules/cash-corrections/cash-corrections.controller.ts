import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CashCorrectionsService } from './cash-corrections.service';
import { CorrectTransactionDto, RequestExceptionDto } from './dto/correction.dto';

/** Store Admin corrections of manual Income / Expense / Withdrawal transactions (the service checks the real Admin role) */
@ApiTags('cash-corrections')
@ApiBearerAuth()
@Controller('cash-transactions')
@RequireModule('cash-register')
export class CashCorrectionsController {
  constructor(private readonly service: CashCorrectionsService) {}

  @Get(':id/edit-status')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  status(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.status(tenantId, user.userId, id);
  }

  @Get(':id/corrections')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  history(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.history(tenantId, user.userId, id);
  }

  /** Re-enter the password (and 2-step code) to unlock one transaction once, for 10 minutes */
  @Post(':id/exception')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  exception(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RequestExceptionDto,
  ) {
    return this.service.requestException(tenantId, user.userId, id, dto);
  }

  @Post(':id/corrections')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  correct(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CorrectTransactionDto,
  ) {
    return this.service.correct(tenantId, user.userId, id, dto);
  }
}
