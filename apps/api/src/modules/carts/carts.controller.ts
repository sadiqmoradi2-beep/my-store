import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import {
  AddCartItemDto,
  CreateCartDto,
  UpdateCartItemDto,
} from './dto/cart.dto';
import { CartsService } from './carts.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('carts')
@ApiBearerAuth()
@Controller('carts')
@RequirePermissions(PERMISSIONS.CARTS_MANAGE)
@RequireModule('cart')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateCartDto) {
    return this.cartsService.create(tenantId, dto);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cartsService.get(tenantId, id);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cartsService.remove(tenantId, id);
  }

  @Post(':id/items')
  addItem(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AddCartItemDto) {
    return this.cartsService.addItem(tenantId, id, dto);
  }

  @Patch(':id/items/:productId')
  updateItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartsService.updateItem(tenantId, id, productId, dto.quantity, dto.unitPrice);
  }

  @Delete(':id/items/:productId')
  removeItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.cartsService.removeItem(tenantId, id, productId);
  }
}
