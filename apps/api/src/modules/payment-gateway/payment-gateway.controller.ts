import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { ConfirmGatewayIntentDto, CreateGatewayIntentDto } from './dto/payment-gateway.dto';
import { PaymentGatewayService } from './payment-gateway.service';

/** Mock online payment gateway — replaceable later with a real gateway */
@ApiTags('payment-gateway')
@ApiBearerAuth()
@Controller('payment-gateway/intents')
export class PaymentGatewayController {
  constructor(private readonly service: PaymentGatewayService) {}

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateGatewayIntentDto,
  ) {
    return this.service.createIntent(tenantId, user.userId, dto);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.getIntent(tenantId, id);
  }

  @Post(':id/confirm')
  confirm(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConfirmGatewayIntentDto,
  ) {
    return this.service.confirmIntent(tenantId, id, dto);
  }
}
