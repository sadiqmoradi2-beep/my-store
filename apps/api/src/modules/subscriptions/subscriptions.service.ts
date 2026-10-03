import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingCycle, PlanCode } from '@prisma/client';
import { PLANS } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../tenant-modules/module-access.service';
import { assertPaid } from '../payment-gateway/payment-gateway.service';

export interface ChangePlanOptions {
  paymentMethod: 'ONLINE' | 'CASH';
  gatewayIntentId?: string;
  billingCycle?: BillingCycle;
}

interface PlanLimits {
  maxBranches: number;
  maxWarehouses?: number;
  maxUsers: number;
  maxProducts: number;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleAccess: ModuleAccessService,
  ) {}

  async current(tenantId: string) {
    const [subscription, usage] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true, pendingPlan: true },
      }),
      getUsage(this.prisma, tenantId),
    ]);
    if (!subscription) throw new NotFoundException('No subscription registered for this store');
    return {
      status: subscription.status,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
      billingCycle: subscription.billingCycle,
      plan: toPlanDto(subscription.plan),
      pendingPlan: subscription.pendingPlan ? toPlanDto(subscription.pendingPlan) : null,
      pendingRequestedAt: subscription.pendingRequestedAt,
      pendingBillingCycle: subscription.pendingBillingCycle,
      usage,
    };
  }

  async plans() {
    const plans = await this.prisma.plan.findMany({ where: { isActive: true } });
    const order: PlanCode[] = ['FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE'];
    return plans
      .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
      .map((p) => toPlanDto(p));
  }

  /**
   * Change plan — two methods:
   * - Cash (CASH): always remains pending platform-admin approval (pendingPlanId), regardless of Plan.requiresApproval.
   * - Online (ONLINE): with a confirmed (PAID) GatewayIntent for the plan amount (matching the monthly/yearly cycle),
   *   it activates immediately — unless the platform admin has separately set that plan's requiresApproval=true.
   */
  async changePlan(tenantId: string, planCode: PlanCode, options: ChangePlanOptions) {
    const [plan, subscription] = await Promise.all([
      this.prisma.plan.findUnique({ where: { code: planCode } }),
      this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),
    ]);
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found');
    if (!subscription) throw new NotFoundException('No subscription registered for this store');

    const limits = plan.limits as unknown as PlanLimits;
    const usage = await getUsage(this.prisma, tenantId);
    const over: string[] = [];
    if (limits.maxBranches !== -1 && usage.branches > limits.maxBranches)
      over.push(`Branches (${usage.branches} of ${limits.maxBranches})`);
    if (limits.maxUsers !== -1 && usage.users > limits.maxUsers)
      over.push(`Users (${usage.users} of ${limits.maxUsers})`);
    if (limits.maxProducts !== -1 && usage.products > limits.maxProducts)
      over.push(`Products (${usage.products} of ${limits.maxProducts})`);
    if (over.length) {
      throw new BadRequestException(`Current usage exceeds this plan's limit: ${over.join(', ')}`);
    }

    const isFree = plan.priceMonthly.equals(0);
    if (options.billingCycle === 'YEARLY' && plan.priceYearly == null) {
      throw new BadRequestException('This plan does not offer a yearly payment option');
    }
    const effectiveCycle: BillingCycle | null = isFree ? null : (options.billingCycle ?? 'MONTHLY');

    const needsApproval = plan.requiresApproval || options.paymentMethod === 'CASH';
    if (needsApproval) {
      await this.prisma.subscription.update({
        where: { tenantId },
        data: {
          pendingPlanId: plan.id,
          pendingBillingCycle: effectiveCycle,
          pendingRequestedAt: new Date(),
        },
      });
      return this.current(tenantId);
    }

    if (plan.priceMonthly.greaterThan(0)) {
      if (!options.gatewayIntentId) {
        throw new BadRequestException('To activate online, first complete the payment');
      }
      const expectedAmount = effectiveCycle === 'YEARLY' ? plan.priceYearly! : plan.priceMonthly;
      await assertPaid(this.prisma, tenantId, options.gatewayIntentId, expectedAmount);
    }

    const startsAt = new Date();
    const endsAt = isFree ? null : addCycle(startsAt, effectiveCycle!);
    const event: 'RENEWED' | 'PLAN_CHANGED' =
      subscription.plan.code === plan.code ? 'RENEWED' : 'PLAN_CHANGED';

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { tenantId },
        data: {
          planId: plan.id,
          status: 'ACTIVE',
          startsAt,
          endsAt,
          billingCycle: effectiveCycle,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingRequestedAt: null,
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          tenantId,
          event,
          fromPlanCode: subscription.plan.code,
          toPlanCode: plan.code,
          billingCycle: effectiveCycle,
          startsAt,
          endsAt,
        },
      });
    });
    this.moduleAccess.invalidate(tenantId);
    return this.current(tenantId);
  }

  /** All pending plan-change requests awaiting approval — SUBSCRIPTION_APPROVE only (platform admin) */
  async pendingRequests() {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { pendingPlanId: { not: null } },
      include: { tenant: true, plan: true, pendingPlan: true },
      orderBy: { pendingRequestedAt: 'asc' },
    });
    return subscriptions.map((s) => ({
      tenantId: s.tenantId,
      tenantName: s.tenant.name,
      tenantSlug: s.tenant.slug,
      currentPlan: toPlanDto(s.plan),
      pendingPlan: toPlanDto(s.pendingPlan!),
      pendingBillingCycle: s.pendingBillingCycle,
      pendingRequestedAt: s.pendingRequestedAt,
    }));
  }

  /** Approve a pending plan-change request — SUBSCRIPTION_APPROVE only (platform admin) */
  async approvePending(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true, pendingPlan: true },
    });
    if (!subscription?.pendingPlanId || !subscription.pendingPlan) {
      throw new BadRequestException('There is no pending approval request for this store');
    }

    const startsAt = new Date();
    const isFree = subscription.pendingPlan.priceMonthly.equals(0);
    const endsAt = isFree ? null : addCycle(startsAt, subscription.pendingBillingCycle ?? 'MONTHLY');
    const event: 'RENEWED' | 'PLAN_CHANGED' =
      subscription.plan.code === subscription.pendingPlan.code ? 'RENEWED' : 'PLAN_CHANGED';

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { tenantId },
        data: {
          planId: subscription.pendingPlanId!,
          status: 'ACTIVE',
          startsAt,
          endsAt,
          billingCycle: isFree ? null : subscription.pendingBillingCycle,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingRequestedAt: null,
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          tenantId,
          event,
          fromPlanCode: subscription.plan.code,
          toPlanCode: subscription.pendingPlan!.code,
          billingCycle: isFree ? null : subscription.pendingBillingCycle,
          startsAt,
          endsAt,
        },
      });
    });
    this.moduleAccess.invalidate(tenantId);
    return this.current(tenantId);
  }

  /** Reject a pending plan-change request */
  async rejectPending(tenantId: string) {
    await this.prisma.subscription.update({
      where: { tenantId },
      data: { pendingPlanId: null, pendingBillingCycle: null, pendingRequestedAt: null },
    });
    return this.current(tenantId);
  }

  /** Global settings for a plan — PLANS_MANAGE only (platform admin) */
  async updatePlanConfig(
    planCode: PlanCode,
    dto: { isActive?: boolean; requiresApproval?: boolean; priceYearly?: number | null },
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundException('Plan not found');
    const updated = await this.prisma.plan.update({
      where: { code: planCode },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.requiresApproval !== undefined && { requiresApproval: dto.requiresApproval }),
        ...(dto.priceYearly !== undefined && { priceYearly: dto.priceYearly }),
      },
    });
    return toPlanDto(updated);
  }
}

/** Current tenant usage totals — exported so the platform tenants console (admin section) can also use it without new DI */
export async function getUsage(prisma: PrismaService, tenantId: string) {
  const [branches, warehouses, users, products] = await Promise.all([
    prisma.branch.count({ where: { tenantId, isActive: true } }),
    prisma.warehouse.count({ where: { tenantId, isActive: true } }),
    prisma.user.count({ where: { tenantId, deletedAt: null } }),
    prisma.product.count({ where: { tenantId, deletedAt: null } }),
  ]);
  return { branches, warehouses, users, products };
}

export function toPlanDto(plan: {
  code: PlanCode;
  name: string;
  priceMonthly: unknown;
  priceYearly: unknown;
  requiresApproval: boolean;
  limits: unknown;
}) {
  const definition = PLANS.find((p) => p.code === plan.code);
  return {
    code: plan.code,
    name: definition?.name ?? { fa: plan.name, ps: plan.name, en: plan.name },
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    requiresApproval: plan.requiresApproval,
    limits: plan.limits as unknown as PlanLimits,
  };
}

/** Add one billing cycle to a date — no date library, just native Date */
export function addCycle(date: Date, cycle: BillingCycle): Date {
  const result = new Date(date);
  if (cycle === 'MONTHLY') result.setMonth(result.getMonth() + 1);
  else result.setFullYear(result.getFullYear() + 1);
  return result;
}

/**
 * Plan limit check when creating a new resource — tx-helper following the project's pattern.
 * kind: which limit; the current count must be taken before creation.
 */
export async function assertPlanLimit(
  prisma: PrismaService,
  tenantId: string,
  kind: 'branches' | 'warehouses' | 'users' | 'products',
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: { select: { limits: true, name: true } } },
  });
  // A plan stopped by the platform admin (CANCELLED) falls back to the Free plan's limits until it is resumed
  const limits = (
    subscription?.status === 'CANCELLED'
      ? PLANS.find((p) => p.code === 'FREE')!.limits
      : (subscription?.plan.limits ?? {})
  ) as Partial<PlanLimits>;
  const max = {
    branches: limits.maxBranches,
    warehouses: limits.maxWarehouses,
    users: limits.maxUsers,
    products: limits.maxProducts,
  }[kind];
  if (max === undefined || max === -1) return;

  const count =
    kind === 'branches'
      ? await prisma.branch.count({ where: { tenantId, isActive: true } })
      : kind === 'warehouses'
        ? await prisma.warehouse.count({ where: { tenantId, isActive: true } })
        : kind === 'users'
          ? await prisma.user.count({ where: { tenantId, deletedAt: null } })
          : await prisma.product.count({ where: { tenantId, deletedAt: null } });
  if (count >= max) {
    throw new BadRequestException(
      `You have reached the limit of your current plan (${max}) — upgrade your plan to add more`,
    );
  }
}
