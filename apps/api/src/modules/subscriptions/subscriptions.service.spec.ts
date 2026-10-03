import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../tenant-modules/module-access.service';
import { assertPlanLimit, SubscriptionsService } from './subscriptions.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('SubscriptionsService.changePlan', () => {
  let service: SubscriptionsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let moduleAccess: { invalidate: jest.Mock };

  const businessPlan = {
    id: 'plan-business',
    code: 'BUSINESS',
    isActive: true,
    priceMonthly: D(0),
    limits: { maxBranches: 5, maxUsers: 25, maxProducts: 5000 },
  };
  const freePlan = {
    id: 'plan-free',
    code: 'FREE',
    isActive: true,
    priceMonthly: D(0),
    limits: { maxBranches: 1, maxUsers: 3, maxProducts: 100 },
  };
  const enterprisePlan = {
    id: 'plan-enterprise',
    code: 'ENTERPRISE',
    isActive: true,
    priceMonthly: D(30),
    limits: { maxBranches: -1, maxUsers: -1, maxProducts: -1 },
  };
  const ONLINE = { paymentMethod: 'ONLINE' as const };
  const CASH = { paymentMethod: 'CASH' as const };

  beforeEach(async () => {
    moduleAccess = { invalidate: jest.fn() };
    prisma = {
      plan: { findUnique: jest.fn().mockResolvedValue(businessPlan) },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', plan: businessPlan }),
        update: jest.fn(),
      },
      subscriptionHistory: { create: jest.fn() },
      branch: { count: jest.fn().mockResolvedValue(2) },
      warehouse: { count: jest.fn().mockResolvedValue(1) },
      user: { count: jest.fn().mockResolvedValue(10) },
      product: { count: jest.fn().mockResolvedValue(50) },
      gatewayIntent: { findFirst: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModuleAccessService, useValue: moduleAccess },
      ],
    }).compile();
    service = moduleRef.get(SubscriptionsService);
  });

  it('usage within the new plan limits (online, free plan) → successful change + cache invalidation', async () => {
    await service.changePlan('t1', 'BUSINESS', ONLINE);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1' },
        data: expect.objectContaining({ planId: 'plan-business', status: 'ACTIVE' }),
      }),
    );
    expect(moduleAccess.invalidate).toHaveBeenCalledWith('t1');
  });

  it('branch count exceeds the new plan limit → error and no change', async () => {
    prisma.plan.findUnique.mockResolvedValue(freePlan);
    prisma.branch.count.mockResolvedValue(2);
    await expect(service.changePlan('t1', 'FREE', ONLINE)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(moduleAccess.invalidate).not.toHaveBeenCalled();
  });

  it('user count exceeds the new plan limit → error and no change', async () => {
    prisma.plan.findUnique.mockResolvedValue(freePlan);
    prisma.branch.count.mockResolvedValue(1);
    prisma.user.count.mockResolvedValue(10);
    await expect(service.changePlan('t1', 'FREE', ONLINE)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('product count exceeds the new plan limit → error and no change', async () => {
    prisma.plan.findUnique.mockResolvedValue(freePlan);
    prisma.branch.count.mockResolvedValue(1);
    prisma.user.count.mockResolvedValue(2);
    prisma.product.count.mockResolvedValue(500);
    await expect(service.changePlan('t1', 'FREE', ONLINE)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('plan with unlimited cap (-1) → no usage check', async () => {
    prisma.plan.findUnique.mockResolvedValue(enterprisePlan);
    prisma.branch.count.mockResolvedValue(999);
    prisma.user.count.mockResolvedValue(999);
    prisma.product.count.mockResolvedValue(999999);
    prisma.gatewayIntent.findFirst.mockResolvedValue({ status: 'PAID', amount: D(30) });
    await service.changePlan('t1', 'ENTERPRISE', { paymentMethod: 'ONLINE', gatewayIntentId: 'gi1' });
    expect(prisma.subscription.update).toHaveBeenCalled();
  });

  it('plan not found or inactive → 404', async () => {
    prisma.plan.findUnique.mockResolvedValue(null);
    await expect(service.changePlan('t1', 'FREE', ONLINE)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('plan requires approval → current planId stays untouched, only pendingPlanId is recorded (even with online payment)', async () => {
    prisma.plan.findUnique.mockResolvedValue({ ...businessPlan, requiresApproval: true });
    await service.changePlan('t1', 'BUSINESS', ONLINE);
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      data: {
        pendingPlanId: 'plan-business',
        pendingBillingCycle: null,
        pendingRequestedAt: expect.any(Date),
      },
    });
    expect(moduleAccess.invalidate).not.toHaveBeenCalled();
  });

  it('cash method → always stays pending approval, even for a plan without requiresApproval', async () => {
    await service.changePlan('t1', 'BUSINESS', CASH);
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      data: {
        pendingPlanId: 'plan-business',
        pendingBillingCycle: null,
        pendingRequestedAt: expect.any(Date),
      },
    });
    expect(moduleAccess.invalidate).not.toHaveBeenCalled();
  });

  it('online method for a non-free plan without gatewayIntentId → error', async () => {
    prisma.plan.findUnique.mockResolvedValue(enterprisePlan);
    await expect(service.changePlan('t1', 'ENTERPRISE', ONLINE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('online method with an unpaid gatewayIntent → error and no activation', async () => {
    prisma.plan.findUnique.mockResolvedValue(enterprisePlan);
    prisma.gatewayIntent.findFirst.mockResolvedValue({ status: 'PENDING', amount: D(30) });
    await expect(
      service.changePlan('t1', 'ENTERPRISE', { paymentMethod: 'ONLINE', gatewayIntentId: 'gi1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});

describe('SubscriptionsService.approvePending/rejectPending', () => {
  let service: SubscriptionsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let moduleAccess: { invalidate: jest.Mock };

  const currentPlan = {
    code: 'BUSINESS',
    name: 'Business',
    priceMonthly: D(10),
    priceYearly: null,
    requiresApproval: false,
    limits: {},
  };
  const pendingPlan = {
    code: 'ENTERPRISE',
    name: 'سازمانی',
    priceMonthly: D(30),
    priceYearly: null,
    requiresApproval: false,
    limits: {},
  };

  beforeEach(async () => {
    moduleAccess = { invalidate: jest.fn() };
    prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          pendingPlanId: 'plan-ent',
          pendingBillingCycle: 'MONTHLY',
          plan: currentPlan,
          pendingPlan,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      subscriptionHistory: { create: jest.fn() },
      plan: {},
      branch: { count: jest.fn().mockResolvedValue(0) },
      warehouse: { count: jest.fn().mockResolvedValue(0) },
      user: { count: jest.fn().mockResolvedValue(0) },
      product: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModuleAccessService, useValue: moduleAccess },
      ],
    }).compile();
    service = moduleRef.get(SubscriptionsService);
  });

  it('approvePending: درخواست در انتظار → planId فعال + پاک شدن pending + ثبت تاریخچه', async () => {
    await service.approvePending('t1');
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1' },
        data: expect.objectContaining({
          planId: 'plan-ent',
          status: 'ACTIVE',
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingRequestedAt: null,
        }),
      }),
    );
    expect(prisma.subscriptionHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          event: 'PLAN_CHANGED',
          fromPlanCode: 'BUSINESS',
          toPlanCode: 'ENTERPRISE',
        }),
      }),
    );
    expect(moduleAccess.invalidate).toHaveBeenCalledWith('t1');
  });

  it('approvePending: بدون درخواست در انتظار → خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ pendingPlanId: null });
    await expect(service.approvePending('t1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejectPending: فقط pending پاک می‌شود', async () => {
    await service.rejectPending('t1');
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      data: { pendingPlanId: null, pendingBillingCycle: null, pendingRequestedAt: null },
    });
    expect(moduleAccess.invalidate).not.toHaveBeenCalled();
  });
});

describe('SubscriptionsService.updatePlanConfig', () => {
  let service: SubscriptionsService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      plan: {
        findUnique: jest.fn().mockResolvedValue({ code: 'FREE' }),
        update: jest.fn().mockImplementation(({ data }) => ({
          code: 'FREE',
          name: 'رایگان',
          priceMonthly: 0,
          priceYearly: null,
          requiresApproval: false,
          limits: {},
          ...data,
        })),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModuleAccessService, useValue: { invalidate: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(SubscriptionsService);
  });

  it('پلن یافت نشد → 404', async () => {
    prisma.plan.findUnique.mockResolvedValue(null);
    await expect(service.updatePlanConfig('FREE', { requiresApproval: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requiresApproval و priceYearly به‌روزرسانی می‌شوند', async () => {
    const result = await service.updatePlanConfig('FREE', { requiresApproval: true, priceYearly: 40 });
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { code: 'FREE' },
      data: { requiresApproval: true, priceYearly: 40 },
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.priceYearly).toBe(40);
  });
});

describe('assertPlanLimit', () => {
  let prisma: Record<string, Record<string, jest.Mock>>;

  function subscriptionWith(limits: Record<string, number>) {
    return { plan: { limits, name: 'BUSINESS' } };
  }

  beforeEach(() => {
    prisma = {
      subscription: { findUnique: jest.fn() },
      branch: { count: jest.fn() },
      warehouse: { count: jest.fn().mockResolvedValue(0) },
      user: { count: jest.fn() },
      product: { count: jest.fn() },
    };
  });

  it('شعبه‌ها: مصرف زیر سقف → بدون خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionWith({ maxBranches: 5 }));
    prisma.branch.count.mockResolvedValue(4);
    await expect(
      assertPlanLimit(prisma as never, 't1', 'branches'),
    ).resolves.toBeUndefined();
  });

  it('شعبه‌ها: مصرف برابر یا بیش از سقف → خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionWith({ maxBranches: 5 }));
    prisma.branch.count.mockResolvedValue(5);
    await expect(assertPlanLimit(prisma as never, 't1', 'branches')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('کاربران: مصرف زیر سقف → بدون خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionWith({ maxUsers: 25 }));
    prisma.user.count.mockResolvedValue(24);
    await expect(assertPlanLimit(prisma as never, 't1', 'users')).resolves.toBeUndefined();
  });

  it('کاربران: مصرف به سقف رسیده → خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionWith({ maxUsers: 25 }));
    prisma.user.count.mockResolvedValue(25);
    await expect(assertPlanLimit(prisma as never, 't1', 'users')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('محصولات: مصرف زیر سقف → بدون خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionWith({ maxProducts: 100 }));
    prisma.product.count.mockResolvedValue(99);
    await expect(assertPlanLimit(prisma as never, 't1', 'products')).resolves.toBeUndefined();
  });

  it('محصولات: مصرف به سقف رسیده → خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionWith({ maxProducts: 100 }));
    prisma.product.count.mockResolvedValue(150);
    await expect(assertPlanLimit(prisma as never, 't1', 'products')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('سقف نامحدود (-1) → بدون شمارش و بدون خطا', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscriptionWith({ maxProducts: -1 }));
    await assertPlanLimit(prisma as never, 't1', 'products');
    expect(prisma.product.count).not.toHaveBeenCalled();
  });

  it('بدون اشتراک ثبت‌شده → limits خالی → بدون بررسی', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    await assertPlanLimit(prisma as never, 't1', 'products');
    expect(prisma.product.count).not.toHaveBeenCalled();
  });
});

describe('assertPlanLimit — warehouses and a stopped plan', () => {
  it('Free plan allows one warehouse; a stopped paid plan falls back to the Free limits', async () => {
    const prisma = {
      subscription: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', plan: { limits: { maxWarehouses: 1 } } }) },
      warehouse: { count: jest.fn().mockResolvedValue(1) },
      product: { count: jest.fn().mockResolvedValue(30) },
    };
    await expect(assertPlanLimit(prisma as never, 't1', 'warehouses')).rejects.toBeInstanceOf(BadRequestException);
    prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELLED', plan: { limits: { maxProducts: 1000 } } });
    await expect(assertPlanLimit(prisma as never, 't1', 'products')).rejects.toBeInstanceOf(BadRequestException);
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', plan: { limits: { maxProducts: 1000 } } });
    await expect(assertPlanLimit(prisma as never, 't1', 'products')).resolves.toBeUndefined();
  });
});
