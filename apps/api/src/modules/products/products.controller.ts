import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  list(@TenantId() tenantId: string, @Query() query: ProductListQueryDto) {
    return this.productsService.list(tenantId, query);
  }

  @Get('barcode/:code')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  getByBarcode(@TenantId() tenantId: string, @Param('code') code: string) {
    return this.productsService.getByBarcode(tenantId, code);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productsService.get(tenantId, id);
  }

  @Get(':id/price-history')
  @RequirePermissions(PERMISSIONS.PRODUCTS_PRICE_HISTORY)
  priceHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productsService.priceHistory(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(tenantId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_DELETE)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productsService.remove(tenantId, id);
  }
}
