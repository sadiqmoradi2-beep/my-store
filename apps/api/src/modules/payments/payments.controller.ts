import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreatePaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('orders/:orderId/payments')
@RequireModule('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ)
  list(@TenantId() tenantId: string, @Param('orderId') orderId: string) {
    return this.paymentsService.listForOrder(tenantId, orderId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PAYMENTS_CREATE)
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(tenantId, user.userId, orderId, dto);
  }
}
