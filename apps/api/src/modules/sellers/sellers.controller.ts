import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateSellerDto, PaySellerSalaryDto, UpdateSellerDto } from './dto/seller.dto';
import { SellersService } from './sellers.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('sellers')
@ApiBearerAuth()
@Controller('sellers')
@RequireModule('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SELLERS_READ)
  list(@TenantId() tenantId: string) {
    return this.sellersService.list(tenantId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SELLERS_MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateSellerDto) {
    return this.sellersService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SELLERS_MANAGE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateSellerDto) {
    return this.sellersService.update(tenantId, id, dto);
  }

  @Get(':id/commissions')
  @RequirePermissions(PERMISSIONS.SELLERS_READ)
  commissions(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.sellersService.commissions(tenantId, id, query);
  }

  @Post(':id/salary-payments')
  @RequirePermissions(PERMISSIONS.SELLERS_MANAGE)
  paySalary(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: PaySellerSalaryDto,
  ) {
    return this.sellersService.paySalary(tenantId, user.userId, id, dto);
  }

  @Get(':id/salary-payments')
  @RequirePermissions(PERMISSIONS.SELLERS_READ)
  salaryPayments(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.sellersService.salaryPayments(tenantId, id, query);
  }
}
