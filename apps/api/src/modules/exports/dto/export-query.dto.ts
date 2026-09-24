import { IsEnum, IsOptional } from 'class-validator';
import { EXPORT_FORMATS, ExportFormat } from '@my-store/shared';
import { SalesReportQueryDto } from '../../reports/dto/report.dto';

export class ExportQueryDto extends SalesReportQueryDto {
  @IsOptional()
  @IsEnum(EXPORT_FORMATS)
  format?: ExportFormat;
}
