import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { StockAdjustDto, StockInDto, StockOutDto, StockTransferDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

class MovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stocks')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  stocks(@TenantId() tenantId: string, @Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.stocks(tenantId, warehouseId);
  }

  @Get('low-stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  lowStock(@TenantId() tenantId: string) {
    return this.inventoryService.lowStocks(tenantId);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  movements(@TenantId() tenantId: string, @Query() query: MovementsQueryDto) {
    return this.inventoryService.movements(tenantId, query);
  }

  @Post('in')
  @RequirePermissions(PERMISSIONS.INVENTORY_IN)
  stockIn(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: StockInDto) {
    return this.inventoryService.stockIn(tenantId, user.userId, dto);
  }

  @Post('out')
  @RequirePermissions(PERMISSIONS.INVENTORY_OUT)
  stockOut(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: StockOutDto) {
    return this.inventoryService.stockOut(tenantId, user.userId, dto);
  }

  @Post('adjust')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  adjust(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: StockAdjustDto) {
    return this.inventoryService.adjust(tenantId, user.userId, dto);
  }

  @Post('transfer')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  transfer(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: StockTransferDto,
  ) {
    return this.inventoryService.transfer(tenantId, user.userId, dto);
  }
}
