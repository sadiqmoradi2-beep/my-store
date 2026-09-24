import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, paginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { getUsage, toPlanDto } from '../subscriptions/subscriptions.service';
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
}
