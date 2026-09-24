import { Injectable } from '@nestjs/common';
import { MODULE_REGISTRY, PLAN_RANK, PlanCode } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_TTL_MS = 60_000;

export interface TenantModuleState {
  planRank: number;
  /** Keys of modules that have been explicitly disabled */
  disabledKeys: Set<string>;
}

interface CacheEntry extends TenantModuleState {
  expiresAt: number;
}

/**
 * Module/plan state for each store, with a short-lived cache — shared source for ModuleGuard and module management.
 * Contract: the absence of a TenantModule row means enabled (default-on); a row with enabled=false means disabled.
 */
@Injectable()
export class ModuleAccessService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async stateOf(tenantId: string): Promise<TenantModuleState> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const [subscription, rows] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: { select: { code: true } } },
      }),
      this.prisma.tenantModule.findMany({
        where: { tenantId, enabled: false },
        include: { module: { select: { key: true } } },
      }),
    ]);
    const state: CacheEntry = {
      planRank: PLAN_RANK[(subscription?.plan.code ?? 'FREE') as PlanCode],
      disabledKeys: new Set(rows.map((r) => r.module.key)),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(tenantId, state);
    return state;
  }

  /** Is the module available for this store (enabled + allowed by plan)? */
  async isEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const definition = MODULE_REGISTRY.find((m) => m.key === moduleKey);
    if (!definition) return true; // Don't block an unknown key
    if (definition.isCore) return true;
    const state = await this.stateOf(tenantId);
    return !state.disabledKeys.has(moduleKey) && state.planRank >= PLAN_RANK[definition.minPlan];
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
