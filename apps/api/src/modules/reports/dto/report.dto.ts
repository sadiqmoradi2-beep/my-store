import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { REPORT_GRANULARITIES, ReportGranularity } from '@my-store/shared';

export class ReportRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SalesReportQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsEnum(REPORT_GRANULARITIES)
  granularity?: ReportGranularity;

  @IsOptional()
  @IsString()
  branchId?: string;
}
