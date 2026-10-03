import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, paginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { addCycle, getUsage, toPlanDto } from '../subscriptions/subscriptions.service';
import { ChangeTenantPlanDto, TenantActivityQueryDto } from './dto/platform-tenant.dto';
import { BackupsService } from '../backups/backups.service';
import { TenantsRepository } from './tenants.repository';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { WipeDataDto } from './dto/wipe-data.dto';

const WIPE_CONFIRM_WORD = 'DELETE ALL';

@Injectable()
export class TenantsService {
  constructor(
    private readonly repo: TenantsRepository,
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
  ) {}

  async getCurrent(tenantId: string) {
    const tenant = await this.repo.findById(tenantId);
    if (!tenant) throw new NotFoundException('Store not found');
    return tenant;
  }

  /** settings is saved as a merge, not a full replacement — existing keys (like purchasing power percent) are preserved */
  async updateCurrent(tenantId: string, dto: UpdateTenantDto) {
    const { settings, ...rest } = dto;
    let mergedSettings: Prisma.InputJsonValue | undefined;
    if (settings !== undefined) {
      const current = await this.repo.findById(tenantId);
      mergedSettings = {
        ...((current?.settings as Record<string, unknown> | undefined) ?? {}),
        ...settings,
      } as Prisma.InputJsonValue;
    }
    return this.repo.update(tenantId, {
      ...rest,
      ...(mergedSettings !== undefined && { settings: mergedSettings }),
    });
  }

  /**
   * Full wipe of the store's data — account owner only (requires confirming the current password + typing the confirmation phrase).
   * A safety backup is taken before deletion; the account structure (users, branches, warehouses, registers) stays intact.
   */
  async wipeData(tenantId: string, userId: string, dto: WipeDataDto) {
    if (dto.confirm.trim() !== WIPE_CONFIRM_WORD) {
      throw new BadRequestException(`To confirm, type the phrase "${WIPE_CONFIRM_WORD}" exactly`);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    return this.backups.wipeData(tenantId, userId, dto.scope);
  }

  /** List of all stores on the platform — platform admin only (TENANTS_MANAGE_ALL) */
  async listAll(query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.repo.findManyForAdmin(query.search, skip, query.limit),
      this.repo.countForAdmin(query.search),
    ]);
    const items = rows.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      isActive: tenant.isActive,
      createdAt: tenant.createdAt,
      plan: tenant.subscription ? toPlanDto(tenant.subscription.plan) : null,
      subscriptionStatus: tenant.subscription?.status ?? null,
      endsAt: tenant.subscription?.endsAt ?? null,
      billingCycle: tenant.subscription?.billingCycle ?? null,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /** Full detail for a store — profile + subscription + usage + history + behavior — platform admin only */
  async detail(id: string) {
    const tenant = await this.repo.findByIdForAdmin(id);
    if (!tenant) throw new NotFoundException('Store not found');

    const [usage, history, behavior] = await Promise.all([
      getUsage(this.prisma, id),
      this.repo.subscriptionHistory(id),
      this.repo.behaviorSignals(id),
    ]);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      address: tenant.address,
      isActive: tenant.isActive,
      createdAt: tenant.createdAt,
      subscription: tenant.subscription && {
        status: tenant.subscription.status,
        startsAt: tenant.subscription.startsAt,
        endsAt: tenant.subscription.endsAt,
        billingCycle: tenant.subscription.billingCycle,
        plan: toPlanDto(tenant.subscription.plan),
        pendingPlan: tenant.subscription.pendingPlan ? toPlanDto(tenant.subscription.pendingPlan) : null,
        pendingBillingCycle: tenant.subscription.pendingBillingCycle,
        pendingRequestedAt: tenant.subscription.pendingRequestedAt,
      },
      usage,
      history,
      behavior,
    };
  }

  // ─────────── Platform admin actions on one store ───────────

  /** Suspend (active=false) or restore a store: its users can't log in, live sessions end within ~30s; data stays */
  async setAccess(id: string, active: boolean) {
    await this.findTenant(id);
    await this.prisma.tenant.update({ where: { id }, data: { isActive: active } });
    if (!active) await this.prisma.user.updateMany({ where: { tenantId: id }, data: { refreshTokenHash: null } });
    return this.detail(id);
  }

  /**
   * Permanently delete a store with all of its data, logins and files. The platform admin types the
   * store's slug to confirm.
   */
  async deleteTenant(id: string, adminUserId: string, confirm: string) {
    const tenant = await this.findTenant(id);
    if (confirm.trim() !== tenant.slug) {
      throw new BadRequestException(`Type the store's slug "${tenant.slug}" to confirm`);
    }
    // Same order-aware business-data delete as a full reset (it also removes every login of the store)
    await this.backups.wipeData(id, adminUserId);
    await this.prisma.$transaction([
      this.prisma.licenseKey.updateMany({ where: { usedByTenantId: id }, data: { usedByTenantId: null } }),
      this.prisma.activityLog.deleteMany({ where: { tenantId: id } }),
      this.prisma.tenantModule.deleteMany({ where: { tenantId: id } }),
      this.prisma.backup.deleteMany({ where: { tenantId: id } }),
      this.prisma.user.deleteMany({ where: { tenantId: id } }),
      this.prisma.tenant.delete({ where: { id } }),
    ]);
    const storage = resolve(process.cwd(), 'storage');
    await Promise.all(
      ['backups', 'uploads/payment-proofs', 'uploads/cash-receipts', 'uploads/purchase-invoices', 'uploads/salary-receipts'].map(
        (dir) => rm(resolve(storage, dir, id), { recursive: true, force: true }),
      ),
    );
    return { deleted: true };
  }

  /** Stop a store's plan: it keeps working with Free-plan limits until resumed */
  async stopPlan(id: string) {
    const subscription = await this.findSubscription(id);
    if (subscription.status === 'CANCELLED') throw new BadRequestException('The plan is already stopped');
    await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { tenantId: id }, data: { status: 'CANCELLED' } }),
      this.prisma.subscriptionHistory.create({
        data: {
          tenantId: id,
          event: 'PLAN_STOPPED',
          fromPlanCode: subscription.plan.code,
          toPlanCode: subscription.plan.code,
          billingCycle: subscription.billingCycle,
          startsAt: new Date(),
          endsAt: subscription.endsAt,
        },
      }),
    ]);
    return this.detail(id);
  }

  async resumePlan(id: string) {
    const subscription = await this.findSubscription(id);
    if (subscription.status !== 'CANCELLED') throw new BadRequestException('The plan is not stopped');
    await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { tenantId: id }, data: { status: 'ACTIVE' } }),
      this.prisma.subscriptionHistory.create({
        data: {
          tenantId: id,
          event: 'PLAN_RESUMED',
          fromPlanCode: subscription.plan.code,
          toPlanCode: subscription.plan.code,
          billingCycle: subscription.billingCycle,
          startsAt: new Date(),
          endsAt: subscription.endsAt,
        },
      }),
    ]);
    return this.detail(id);
  }

  /** Put a store on any plan right away (no payment) — a new period starts today */
  async changePlan(id: string, dto: ChangeTenantPlanDto) {
    const subscription = await this.findSubscription(id);
    const plan = await this.prisma.plan.findUnique({ where: { code: dto.planCode } });
    if (!plan) throw new NotFoundException('Plan not found');
    const billingCycle = dto.planCode === 'FREE' ? null : (dto.billingCycle ?? 'MONTHLY');
    const startsAt = new Date();
    const endsAt = billingCycle ? addCycle(startsAt, billingCycle) : null;
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { tenantId: id },
        data: {
          planId: plan.id,
          status: 'ACTIVE',
          startsAt,
          endsAt,
          billingCycle,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingRequestedAt: null,
        },
      }),
      this.prisma.subscriptionHistory.create({
        data: {
          tenantId: id,
          event: 'PLAN_CHANGED',
          fromPlanCode: subscription.plan.code,
          toPlanCode: plan.code,
          billingCycle,
          startsAt,
          endsAt,
        },
      }),
    ]);
    return this.detail(id);
  }

  /** The store's activity log with who did it (name, email, role) — filter by admins / other users */
  async activity(id: string, query: TenantActivityQueryDto) {
    await this.findTenant(id);
    const who = query.who ?? 'all';
    let userFilter: Prisma.ActivityLogWhereInput = {};
    if (who !== 'all') {
      const admins = (
        await this.prisma.user.findMany({ where: { tenantId: id, role: { key: 'ADMIN' } }, select: { id: true } })
      ).map((u) => u.id);
      userFilter =
        who === 'admins' ? { userId: { in: admins } } : { OR: [{ userId: null }, { userId: { notIn: admins } }] };
    }
    const where: Prisma.ActivityLogWhereInput = {
      tenantId: id,
      ...userFilter,
      ...(query.search && {
        AND: [{ OR: [{ action: { contains: query.search } }, { path: { contains: query.search } }] }],
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.activityLog.findMany({ where, skip, take: query.limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.activityLog.count({ where }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId).filter((u): u is string => !!u))];
    const users = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, email: true, role: { select: { key: true } } },
        })
      ).map((u) => [u.id, u]),
    );
    const items = rows.map((row) => {
      const user = row.userId ? users.get(row.userId) : undefined;
      return {
        id: row.id,
        createdAt: row.createdAt,
        userId: row.userId,
        userName: user?.fullName ?? null,
        userEmail: user?.email ?? null,
        roleKey: user?.role.key ?? null,
        action: row.action,
        method: row.method,
        path: row.path,
        statusCode: row.statusCode,
        ip: row.ip,
      };
    });
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  private async findTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Store not found');
    return tenant;
  }

  private async findSubscription(id: string) {
    await this.findTenant(id);
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId: id },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundException('This store has no subscription');
    return subscription;
  }
}
