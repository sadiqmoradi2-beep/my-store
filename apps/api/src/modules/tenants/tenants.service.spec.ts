import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupsService } from '../backups/backups.service';
import { TenantsRepository } from './tenants.repository';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  let service: TenantsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let backups: any;

  const tenant = { id: 't1', slug: 'my-shop', name: 'My Store', phone: null, address: null };
  const businessPlan = {
    code: 'BUSINESS',
    name: 'Business',
    priceMonthly: 10,
    priceYearly: null,
    requiresApproval: false,
    limits: {},
  };

  beforeEach(async () => {
    repo = {
      findById: jest.fn().mockResolvedValue(tenant),
      update: jest.fn().mockImplementation((_id, data) => ({ ...tenant, ...data })),
      findManyForAdmin: jest.fn().mockResolvedValue([]),
      countForAdmin: jest.fn().mockResolvedValue(0),
      findByIdForAdmin: jest.fn(),
      subscriptionHistory: jest.fn().mockResolvedValue([]),
      behaviorSignals: jest.fn().mockResolvedValue({ lastAdminLoginAt: null, totalSales: 0 }),
    };
    const passwordHash = await bcrypt.hash('correct-pass', 4);
    prisma = {
      branch: { count: jest.fn().mockResolvedValue(1) },
      warehouse: { count: jest.fn().mockResolvedValue(1) },
      user: {
        count: jest.fn().mockResolvedValue(2),
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', passwordHash }),
      },
      product: { count: jest.fn().mockResolvedValue(3) },
    };
    backups = { wipeData: jest.fn().mockResolvedValue({ wiped: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: TenantsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: BackupsService, useValue: backups },
      ],
    }).compile();
    service = moduleRef.get(TenantsService);
  });

  describe('getCurrent', () => {
    it('returns the existing store', async () => {
      const result = await service.getCurrent('t1');
      expect(result).toEqual(tenant);
      expect(repo.findById).toHaveBeenCalledWith('t1');
    });

    it('store not found → 404', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getCurrent('t-missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateCurrent', () => {
    it('updates only the allowed DTO fields (no slug/id)', async () => {
      await service.updateCurrent('t1', { name: 'New Store', phone: '0700000000' });
      expect(repo.update).toHaveBeenCalledWith('t1', {
        name: 'New Store',
        phone: '0700000000',
      });
      const data = repo.update.mock.calls[0][1];
      expect(data.slug).toBeUndefined();
      expect(data.id).toBeUndefined();
    });

    it('settings is only sent when defined', async () => {
      await service.updateCurrent('t1', { name: 'New Store' });
      const data = repo.update.mock.calls[0][1];
      expect('settings' in data).toBe(false);
    });

    it('settings defined → added to data', async () => {
      await service.updateCurrent('t1', { settings: { theme: 'dark' } });
      expect(repo.update).toHaveBeenCalledWith('t1', { settings: { theme: 'dark' } });
    });
  });

  describe('listAll', () => {
    it('paginates and maps rows into summary form', async () => {
      repo.findManyForAdmin.mockResolvedValue([
        {
          id: 't1',
          name: 'My Store',
          slug: 'my-shop',
          isActive: true,
          createdAt: new Date('2026-01-01'),
          subscription: { plan: businessPlan, status: 'ACTIVE', endsAt: null, billingCycle: 'MONTHLY' },
        },
      ]);
      repo.countForAdmin.mockResolvedValue(1);
      const result = await service.listAll({ page: 1, limit: 20 } as never);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ id: 't1', slug: 'my-shop', subscriptionStatus: 'ACTIVE' });
      expect(result.meta.total).toBe(1);
    });
  });

  describe('detail', () => {
    it('store not found → 404', async () => {
      repo.findByIdForAdmin.mockResolvedValue(null);
      await expect(service.detail('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns profile + subscription + usage + history + behavior', async () => {
      repo.findByIdForAdmin.mockResolvedValue({
        ...tenant,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        subscription: {
          status: 'ACTIVE',
          startsAt: new Date(),
          endsAt: null,
          billingCycle: 'MONTHLY',
          plan: businessPlan,
          pendingPlan: null,
          pendingBillingCycle: null,
          pendingRequestedAt: null,
        },
      });
      repo.subscriptionHistory.mockResolvedValue([{ id: 'h1', event: 'PLAN_CHANGED' }]);
      repo.behaviorSignals.mockResolvedValue({ lastAdminLoginAt: null, totalSales: 5 });

      const result = await service.detail('t1');
      expect(result.usage).toEqual({ branches: 1, warehouses: 1, users: 2, products: 3 });
      expect(result.history).toHaveLength(1);
      expect(result.behavior.totalSales).toBe(5);
      expect(result.subscription?.plan.code).toBe('BUSINESS');
    });
  });

  describe('wipeData', () => {
    it('incorrect confirmation phrase → 400 and wipeData is not called', async () => {
      await expect(
        service.wipeData('t1', 'u1', { password: 'correct-pass', confirm: 'wrong' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(backups.wipeData).not.toHaveBeenCalled();
    });

    it('incorrect password → 401 and wipeData is not called', async () => {
      await expect(
        service.wipeData('t1', 'u1', { password: 'wrong-pass', confirm: 'DELETE ALL' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(backups.wipeData).not.toHaveBeenCalled();
    });

    it('correct password and confirmation phrase → wipe proceeds', async () => {
      const result = await service.wipeData('t1', 'u1', {
        password: 'correct-pass',
        confirm: 'DELETE ALL',
      });
      expect(backups.wipeData).toHaveBeenCalledWith('t1', 'u1', undefined);
      expect(result).toEqual({ wiped: true });
    });

    it('with a scope → passed through to backups.wipeData', async () => {
      await service.wipeData('t1', 'u1', {
        password: 'correct-pass',
        confirm: 'DELETE ALL',
        scope: 'CASH',
      });
      expect(backups.wipeData).toHaveBeenCalledWith('t1', 'u1', 'CASH');
    });
  });
});

describe('TenantsService — platform admin actions', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let backups: any;
  let service: TenantsService;
  const sub = { tenantId: 't1', status: 'ACTIVE', billingCycle: 'MONTHLY', endsAt: null, plan: { code: 'BUSINESS' } };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', slug: 'my-shop' }),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: { updateMany: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'admin1' }]) },
      subscription: { findUnique: jest.fn().mockResolvedValue(sub), update: jest.fn() },
      subscriptionHistory: { create: jest.fn() },
      plan: { findUnique: jest.fn().mockResolvedValue({ id: 'plan-starter', code: 'STARTER' }) },
      licenseKey: { updateMany: jest.fn() },
      activityLog: {
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'l1', userId: 'admin1', action: 'products.create', method: 'POST', path: '/p', statusCode: 201, createdAt: new Date() },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      tenantModule: { deleteMany: jest.fn() },
      backup: { deleteMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    backups = { wipeData: jest.fn().mockResolvedValue({ wiped: true }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: TenantsRepository, useValue: { findByIdForAdmin: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: BackupsService, useValue: backups },
      ],
    }).compile();
    service = moduleRef.get(TenantsService);
    // detail() is covered elsewhere — here only the action matters
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);
  });

  it('suspend → store inactive and every refresh token revoked; restore → active again', async () => {
    await service.setAccess('t1', false);
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { isActive: false } });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { tenantId: 't1' }, data: { refreshTokenHash: null } });
    prisma.user.updateMany.mockClear();
    await service.setAccess('t1', true);
    expect(prisma.tenant.update).toHaveBeenLastCalledWith({ where: { id: 't1' }, data: { isActive: true } });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('delete: wrong slug → 400 and nothing deleted; right slug → wipe + store row deleted', async () => {
    await expect(service.deleteTenant('t1', 'sa', 'other')).rejects.toBeInstanceOf(BadRequestException);
    expect(backups.wipeData).not.toHaveBeenCalled();
    await service.deleteTenant('t1', 'sa', 'my-shop');
    expect(backups.wipeData).toHaveBeenCalledWith('t1', 'sa');
    expect(prisma.tenant.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(prisma.licenseKey.updateMany).toHaveBeenCalledWith({ where: { usedByTenantId: 't1' }, data: { usedByTenantId: null } });
  });

  it('stop → CANCELLED + history; stopping twice → 400; resume → ACTIVE', async () => {
    await service.stopPlan('t1');
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { tenantId: 't1' }, data: { status: 'CANCELLED' } });
    expect(prisma.subscriptionHistory.create.mock.calls[0][0].data.event).toBe('PLAN_STOPPED');
    prisma.subscription.findUnique.mockResolvedValue({ ...sub, status: 'CANCELLED' });
    await expect(service.stopPlan('t1')).rejects.toBeInstanceOf(BadRequestException);
    await service.resumePlan('t1');
    expect(prisma.subscription.update).toHaveBeenLastCalledWith({ where: { tenantId: 't1' }, data: { status: 'ACTIVE' } });
    expect(prisma.subscriptionHistory.create.mock.calls[1][0].data.event).toBe('PLAN_RESUMED');
  });

  it('change plan → new plan active now with a fresh period; Free has no cycle or end date', async () => {
    await service.changePlan('t1', { planCode: 'STARTER', billingCycle: 'YEARLY' });
    const data = prisma.subscription.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ planId: 'plan-starter', status: 'ACTIVE', billingCycle: 'YEARLY', pendingPlanId: null });
    expect(data.endsAt.getFullYear()).toBe(new Date().getFullYear() + 1);
    prisma.plan.findUnique.mockResolvedValue({ id: 'plan-free', code: 'FREE' });
    await service.changePlan('t1', { planCode: 'FREE', billingCycle: 'MONTHLY' });
    expect(prisma.subscription.update.mock.calls[1][0].data).toMatchObject({ billingCycle: null, endsAt: null });
  });

  it('activity: admins filter uses the store admins, rows carry who did it', async () => {
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'admin1' }])
      .mockResolvedValueOnce([{ id: 'admin1', fullName: 'Owner', email: 'o@x.io', role: { key: 'ADMIN' } }]);
    const result = await service.activity('t1', { page: 1, limit: 20, who: 'admins' });
    expect(prisma.activityLog.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', userId: { in: ['admin1'] } });
    expect(result.items[0]).toMatchObject({ userName: 'Owner', userEmail: 'o@x.io', roleKey: 'ADMIN', action: 'products.create' });
  });
});
