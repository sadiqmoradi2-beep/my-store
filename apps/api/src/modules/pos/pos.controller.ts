import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PosSaleDto } from './dto/pos.dto';
import { PosService } from './pos.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
@RequireModule('cash-register')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('sale')
  @RequirePermissions(PERMISSIONS.POS_USE)
  sale(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Body() dto: PosSaleDto) {
    return this.posService.sale(tenantId, user.userId, dto);
  }
}
