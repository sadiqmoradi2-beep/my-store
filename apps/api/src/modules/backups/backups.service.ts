import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { AUTO_BACKUP_KEEP, RESET_SCOPE_MODEL_KEYS, ResetScope } from '@my-store/shared';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BACKUP_MODELS, sortByParentFirst } from './backup-registry';

const BACKUP_VERSION = 1;
const CHUNK = 1000;

/** Kept by a "full data wipe": roles and the logins of the owner / admins. Everything else goes. */
const WIPE_PRESERVED_KEYS = new Set(['role', 'rolePermission', 'user']);

interface BackupPayload {
  version: number;
  tenantId: string;
  createdAt: string;
  tenant: { name: string; slug: string };
  data: Record<string, Record<string, unknown>[]>;
}

type AnyDelegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  deleteMany(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
};

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly baseDir = resolve(process.cwd(), 'storage', 'backups');

  constructor(private readonly prisma: PrismaService) {}

  private delegate(client: unknown, key: string): AnyDelegate {
    return (client as Record<string, AnyDelegate>)[key];
  }

  private filePath(tenantId: string, fileName: string) {
    return join(this.baseDir, tenantId, fileName);
  }

  async list(tenantId: string, query: PaginationQueryDto) {
    const where = { tenantId };
    const [rows, total] = await Promise.all([
      this.prisma.backup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.backup.count({ where }),
    ]);
    return { items: rows, meta: paginationMeta(query.page, query.limit, total) };
  }

  async create(tenantId: string, type: 'MANUAL' | 'AUTO', createdById?: string, note?: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const data: BackupPayload['data'] = {};
    for (const model of BACKUP_MODELS) {
      data[model.key] = await this.delegate(this.prisma, model.key).findMany({
        where: model.where(tenantId),
      });
    }
    const payload: BackupPayload = {
      version: BACKUP_VERSION,
      tenantId,
      createdAt: new Date().toISOString(),
      tenant: { name: tenant.name, slug: tenant.slug },
      data,
    };
    const json = JSON.stringify(payload);
    const fileName = `backup-${payload.createdAt.replace(/[:.]/g, '-')}.json`;
    await mkdir(join(this.baseDir, tenantId), { recursive: true });
    await writeFile(this.filePath(tenantId, fileName), json, 'utf8');
    return this.prisma.backup.create({
      data: { tenantId, type, fileName, sizeBytes: Buffer.byteLength(json), note, createdById },
    });
  }

  async download(tenantId: string, id: string) {
    const backup = await this.find(tenantId, id, true);
    const path = this.filePath(tenantId, backup.fileName);
    await stat(path).catch(() => {
      throw new NotFoundException('Backup file not found on the server');
    });
    return { path, fileName: backup.fileName };
  }

  /** Full restore: delete the store's current data and insert the backup file's data in one transaction */
  async restore(tenantId: string, id: string, currentUserId: string) {
    const backup = await this.find(tenantId, id, true);
    const raw = await readFile(this.filePath(tenantId, backup.fileName), 'utf8').catch(() => {
      throw new NotFoundException('Backup file not found on the server');
    });
    const payload = JSON.parse(raw) as BackupPayload;
    if (payload.tenantId !== tenantId || payload.version !== BACKUP_VERSION) {
      throw new BadRequestException('Backup file is not valid');
    }

    const me = await this.prisma.user.findUnique({ where: { id: currentUserId } });

    await this.prisma.$transaction(
      async (tx) => {
        for (const model of [...BACKUP_MODELS].reverse()) {
          await this.delegate(tx, model.key).deleteMany({ where: model.where(tenantId) });
        }
        for (const model of BACKUP_MODELS) {
          let rows = payload.data[model.key] ?? [];
          if (model.key === 'category') {
            rows = sortByParentFirst(rows as { id: string; parentId: string | null }[]);
          }
          if (model.jsonFields?.length) {
            rows = rows.map((row) => ({
              ...row,
              ...Object.fromEntries(
                model.jsonFields!.map((f) => [f, row[f] === null ? Prisma.JsonNull : row[f]]),
              ),
            }));
          }
          for (let i = 0; i < rows.length; i += CHUNK) {
            await this.delegate(tx, model.key).createMany({ data: rows.slice(i, i + CHUNK) });
          }
        }
        // The user performing the restore shouldn't lose access if they weren't in the backup
        const users = (payload.data.user ?? []) as { id: string; email: string }[];
        if (me && !users.some((u) => u.id === me.id || u.email === me.email)) {
          await tx.user.create({
            data: { ...me, branchId: null, uiPrefs: me.uiPrefs ?? Prisma.JsonNull },
          });
        }
      },
      { timeout: 300_000 },
    );
    return { restored: true, backupId: id };
  }

  /**
   * Wipe the store's data — either everything (all business data, team, inventory, branches and their
   * Cash / EBT / Zelle boxes; only roles and admin logins stay, and one fresh main branch is created) or a specific
   * scope (e.g. just sales, or just income history). A safety backup is taken automatically first.
   */
  async wipeData(tenantId: string, currentUserId: string, scope?: ResetScope) {
    await this.create(tenantId, 'MANUAL', currentUserId, `Automatic backup before data reset (${scope ?? 'ALL'})`);

    const isFullWipe = !scope || scope === 'ALL';
    const modelsByKey = new Map(BACKUP_MODELS.map((m) => [m.key, m]));
    const orderedModels = isFullWipe
      ? [...BACKUP_MODELS.filter((m) => !WIPE_PRESERVED_KEYS.has(m.key))].reverse()
      : RESET_SCOPE_MODEL_KEYS[scope].map((key) => modelsByKey.get(key)!);
    const touchesCash = isFullWipe || scope === 'CASH';

    await this.prisma.$transaction(
      async (tx) => {
        // Staff logins tied to sellers / employees go together with the team, on a full wipe or a TEAM reset
        let staffUserIds: string[] = [];
        const removesTeam = isFullWipe || scope === 'TEAM';
        if (removesTeam) {
          const [sellerRows, employeeRows] = await Promise.all([
            tx.sellerProfile.findMany({ where: { tenantId }, select: { userId: true } }),
            tx.employee.findMany({ where: { tenantId, userId: { not: null } }, select: { userId: true } }),
          ]);
          staffUserIds = [...new Set([...sellerRows, ...employeeRows].map((r) => r.userId).filter((id): id is string => !!id))].filter(
            (id) => id !== currentUserId,
          );
        }
        if (isFullWipe) {
          // Branches are deleted too — detach the remaining logins first
          await tx.user.updateMany({ where: { tenantId }, data: { branchId: null } });
        }
        for (const model of orderedModels) {
          await this.delegate(tx, model.key).deleteMany({ where: model.where(tenantId) });
        }
        if (staffUserIds.length > 0) {
          await tx.user.deleteMany({
            where: { id: { in: staffUserIds }, tenantId, role: { key: { not: 'ADMIN' } } },
          });
        }
        if (isFullWipe) {
          // Start again with one brand-new main branch; its warehouse and Cash / EBT / Zelle boxes are created on first use
          const branch = await tx.branch.create({
            data: { tenantId, name: 'Main Branch', code: 'MAIN', isMain: true },
          });
          await tx.user.updateMany({ where: { tenantId }, data: { branchId: branch.id } });
        }
        if (touchesCash && !isFullWipe) {
          // The Income history was wiped — Cash / EBT / Zelle start again from zero
          await tx.cashRegister.updateMany({
            where: { tenantId },
            data: { balance: 0, openingBalance: 0 },
          });
        }
      },
      { timeout: 300_000 },
    );
    return { wiped: true, scope: scope ?? 'ALL' };
  }

  async remove(tenantId: string, id: string) {
    const backup = await this.find(tenantId, id);
    await this.prisma.backup.delete({ where: { id: backup.id } });
    await rm(this.filePath(tenantId, backup.fileName), { force: true });
    return { deleted: true };
  }

  async getAutoSetting(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const settings = (tenant.settings ?? {}) as Record<string, unknown>;
    return { enabled: settings.autoBackup === true };
  }

  async setAutoSetting(tenantId: string, enabled: boolean) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const settings = (tenant.settings ?? {}) as Record<string, unknown>;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...settings, autoBackup: enabled } as Prisma.InputJsonValue },
    });
    return { enabled };
  }

  /** Nightly automatic backup for active stores with autoBackup enabled */
  @Cron('30 2 * * *')
  async runAutoBackups() {
    const tenants = await this.prisma.tenant.findMany({ where: { isActive: true } });
    for (const tenant of tenants) {
      const settings = (tenant.settings ?? {}) as Record<string, unknown>;
      if (settings.autoBackup !== true) continue;
      try {
        await this.create(tenant.id, 'AUTO');
        await this.pruneAuto(tenant.id);
      } catch (error) {
        this.logger.error(`auto backup failed for tenant ${tenant.slug}`, error as Error);
        await this.prisma.backup.create({
          data: { tenantId: tenant.id, type: 'AUTO', status: 'FAILED', fileName: '-', sizeBytes: 0 },
        });
      }
    }
  }

  private async pruneAuto(tenantId: string) {
    const old = await this.prisma.backup.findMany({
      where: { tenantId, type: 'AUTO' },
      orderBy: { createdAt: 'desc' },
      skip: AUTO_BACKUP_KEEP,
    });
    for (const backup of old) {
      await this.prisma.backup.delete({ where: { id: backup.id } });
      if (backup.fileName !== '-') {
        await rm(this.filePath(tenantId, backup.fileName), { force: true });
      }
    }
  }

  private async find(tenantId: string, id: string, requireCompleted = false) {
    const backup = await this.prisma.backup.findFirst({ where: { id, tenantId } });
    if (!backup) throw new NotFoundException('Backup not found');
    if (requireCompleted && backup.status !== 'COMPLETED') {
      throw new BadRequestException('This backup is incomplete');
    }
    return backup;
  }
}
