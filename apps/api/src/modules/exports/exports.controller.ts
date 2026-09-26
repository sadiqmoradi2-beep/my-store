import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { ExportQueryDto } from './dto/export-query.dto';
import { ExportSheet, renderSheet } from './export-sheet';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('products')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  async products(@TenantId() tenantId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    await this.send(res, await this.exportsService.products(tenantId), query);
  }

  @Get('sales')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  async sales(@TenantId() tenantId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    await this.send(res, await this.exportsService.sales(tenantId, query), query);
  }

  @Get('stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  async stock(@TenantId() tenantId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    await this.send(res, await this.exportsService.stock(tenantId), query);
  }

  @Get('cash')
  @RequirePermissions(PERMISSIONS.CASH_READ)
  async cash(@TenantId() tenantId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    await this.send(res, await this.exportsService.cash(tenantId, query), query);
  }

  @Get('debts')
  @RequirePermissions(PERMISSIONS.DEBTS_READ)
  async debts(@TenantId() tenantId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    await this.send(res, await this.exportsService.debts(tenantId), query);
  }

  @Get('sales-report')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async salesReport(@TenantId() tenantId: string, @Query() query: ExportQueryDto, @Res() res: Response) {
    await this.send(res, await this.exportsService.salesReport(tenantId, query), query);
  }

  private async send(res: Response, sheet: ExportSheet, query: ExportQueryDto) {
    const { buffer, fileName, contentType } = await renderSheet(sheet, query.format ?? 'xlsx');
    res
      .setHeader('Content-Type', contentType)
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(buffer);
  }
}
