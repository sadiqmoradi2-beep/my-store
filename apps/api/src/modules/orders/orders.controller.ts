import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateOrderDto, OrderListQueryDto, TransitionOrderDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  list(@TenantId() tenantId: string, @Query() query: OrderListQueryDto) {
    return this.ordersService.list(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.ordersService.get(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(tenantId, user.userId, dto);
  }

  @Post(':id/transition')
  @RequirePermissions(PERMISSIONS.ORDERS_TRANSITION)
  transition(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: TransitionOrderDto,
  ) {
    return this.ordersService.transition(tenantId, user.userId, id, dto);
  }
}
