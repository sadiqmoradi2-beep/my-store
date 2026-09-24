import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import {
  CreateLedgerEntryDto,
  CreatePartnerDto,
  DistributeProfitDto,
  PartnerLedgerQueryDto,
  UpdatePartnerDto,
} from './dto/partner.dto';
import { PartnersService } from './partners.service';

@ApiTags('partners')
@ApiBearerAuth()
@Controller('partners')
@RequireModule('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PARTNERS_READ)
  list(@TenantId() tenantId: string) {
    return this.partnersService.list(tenantId);
  }

  @Get('ledger')
  @RequirePermissions(PERMISSIONS.PARTNERS_READ)
  ledger(@TenantId() tenantId: string, @Query() query: PartnerLedgerQueryDto) {
    return this.partnersService.ledger(tenantId, query);
  }

  @Post('distribute/preview')
  @RequirePermissions(PERMISSIONS.PARTNERS_MANAGE)
  previewDistribution(@TenantId() tenantId: string, @Body() dto: DistributeProfitDto) {
    return this.partnersService.previewDistribution(tenantId, dto);
  }

  @Post('distribute')
  @RequirePermissions(PERMISSIONS.PARTNERS_MANAGE)
  distribute(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: DistributeProfitDto) {
    return this.partnersService.distribute(tenantId, user.userId, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PARTNERS_READ)
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.partnersService.get(tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PARTNERS_MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreatePartnerDto) {
    return this.partnersService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PARTNERS_MANAGE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PARTNERS_MANAGE)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.partnersService.remove(tenantId, id);
  }

  @Post(':id/entries')
  @RequirePermissions(PERMISSIONS.PARTNERS_MANAGE)
  addLedgerEntry(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateLedgerEntryDto,
  ) {
    return this.partnersService.addLedgerEntry(tenantId, user.userId, id, dto);
  }
}
