import { BadRequestException, Controller, Delete, Get, Injectable, Logger, Module, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

const DAY_MS = 86_400_000;

/** Exactly one way of choosing what to delete: everything, a time window (from/to), a cutoff date, or an age */
export class ActivityCleanupQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;

  /** Delete entries created in [from, to) — the web sends one local calendar day */
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(36_500)
  olderThanDays?: number;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: PaginationQueryDto) {
    const where = {
      tenantId,
      ...(query.search && { action: { contains: query.search } }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      ).map((u) => [u.id, u.fullName]),
    );
    const items = rows.map((row) => ({
      ...row,
      userName: row.userId ? (names.get(row.userId) ?? null) : null,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /** Manual delete — everything, one time window, before a date, or older than a number of days */
  async cleanup(
    tenantId: string,
    params: { all?: boolean; from?: Date; to?: Date; before?: Date; olderThanDays?: number },
  ) {
    if (params.all) {
      return { deleted: (await this.prisma.activityLog.deleteMany({ where: { tenantId } })).count };
    }
    if (params.from || params.to) {
      if (!params.from || !params.to || params.from >= params.to) {
        throw new BadRequestException('Give both "from" and "to", with "from" before "to"');
      }
      const result = await this.prisma.activityLog.deleteMany({
        where: { tenantId, createdAt: { gte: params.from, lt: params.to } },
      });
      return { deleted: result.count };
    }
    const cutoff =
      params.before ?? (params.olderThanDays != null
        ? new Date(Date.now() - params.olderThanDays * DAY_MS)
        : null);
    if (!cutoff) return { deleted: 0 };
    const result = await this.prisma.activityLog.deleteMany({
      where: { tenantId, createdAt: { lt: cutoff } },
    });
    return { deleted: result.count };
  }

  /** Automatic daily cleanup — only for stores that have set a retention day limit in settings */
  @Cron('0 3 * * *')
  async runAutoCleanup() {
    const tenants = await this.prisma.tenant.findMany({ where: { isActive: true } });
    for (const tenant of tenants) {
      const settings = (tenant.settings ?? {}) as Record<string, unknown>;
      const retentionDays = settings.activityLogRetentionDays;
      if (typeof retentionDays !== 'number' || retentionDays <= 0) continue;
      try {
        await this.cleanup(tenant.id, { olderThanDays: retentionDays });
      } catch (error) {
        this.logger.error(`activity-log auto cleanup failed for tenant ${tenant.slug}`, error as Error);
      }
    }
  }
}

/** URL path deliberately obscure — minimal hardening; real control is via permission (ACTIVITY_READ) */
@ApiTags('activity-log')
@ApiBearerAuth()
@Controller('sys-log-audit')
@RequireModule('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ACTIVITY_READ)
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.activityLogService.list(tenantId, query);
  }

  /** Manual delete: ?all=true, ?from=…&to=…, ?before=2026-01-01 or ?olderThanDays=7 */
  @Delete('cleanup')
  @RequirePermissions(PERMISSIONS.TENANTS_UPDATE)
  cleanup(@TenantId() tenantId: string, @Query() query: ActivityCleanupQueryDto) {
    return this.activityLogService.cleanup(tenantId, {
      all: query.all,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      before: query.before ? new Date(query.before) : undefined,
      olderThanDays: query.olderThanDays,
    });
  }
}

@Module({
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
})
export class ActivityLogModule {}
