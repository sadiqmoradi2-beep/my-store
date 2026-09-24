import { Controller, Delete, Get, Injectable, Logger, Module, Query } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

const DAY_MS = 86_400_000;

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

  /** Manual delete — before a given date or older than a specified number of days (both methods, item 11) */
  async cleanup(tenantId: string, params: { before?: Date; olderThanDays?: number }) {
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

  /** Manual delete: ?before=2026-01-01 or ?olderThanDays=90 */
  @Delete('cleanup')
  @RequirePermissions(PERMISSIONS.TENANTS_UPDATE)
  cleanup(
    @TenantId() tenantId: string,
    @Query('before') before?: string,
    @Query('olderThanDays') olderThanDays?: string,
  ) {
    return this.activityLogService.cleanup(tenantId, {
      before: before ? new Date(before) : undefined,
      olderThanDays: olderThanDays ? Number(olderThanDays) : undefined,
    });
  }
}

@Module({
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
})
export class ActivityLogModule {}
