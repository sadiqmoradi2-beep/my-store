import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from './activity-log.module';

describe('ActivityLogService.list', () => {
  let service: ActivityLogService;
  let prisma: {
    activityLog: { findMany: jest.Mock; count: jest.Mock; deleteMany: jest.Mock };
    user: { findMany: jest.Mock };
    tenant: { findMany: jest.Mock };
  };

  const rows = [
    { id: 'log-1', tenantId: 't1', userId: 'u1', action: 'ORDER_CREATE', createdAt: new Date() },
    { id: 'log-2', tenantId: 't1', userId: 'u2', action: 'ORDER_UPDATE', createdAt: new Date() },
    { id: 'log-3', tenantId: 't1', userId: null, action: 'SYSTEM_JOB', createdAt: new Date() },
  ];

  beforeEach(async () => {
    prisma = {
      activityLog: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(3),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', fullName: 'علی احمدی' },
          { id: 'u2', fullName: 'مریم رضایی' },
        ]),
      },
      tenant: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ActivityLogService);
  });

  it('نام کاربر را به هر رکورد بر اساس userId اضافه می‌کند', async () => {
    const result = await service.list('t1', { page: 1, limit: 20 });
    expect(result.items[0].userName).toBe('علی احمدی');
    expect(result.items[1].userName).toBe('مریم رضایی');
  });

  it('رکورد بدون userId → userName برابر null', async () => {
    const result = await service.list('t1', { page: 1, limit: 20 });
    expect(result.items[2].userName).toBeNull();
  });

  it('meta صفحه‌بندی صحیح برمی‌گرداند', async () => {
    const result = await service.list('t1', { page: 1, limit: 20 });
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
  });

  it('صفحه دوم → skip صحیح محاسبه می‌شود', async () => {
    await service.list('t1', { page: 2, limit: 10 });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('search → فیلتر action با contains اعمال می‌شود', async () => {
    await service.list('t1', { page: 1, limit: 20, search: 'ORDER' });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', action: { contains: 'ORDER' } },
      }),
    );
    expect(prisma.activityLog.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', action: { contains: 'ORDER' } },
      }),
    );
  });

  it('بدون userId در بین رکوردها → user.findMany صدا زده نمی‌شود با آرایه خالی', async () => {
    prisma.activityLog.findMany.mockResolvedValue([
      { id: 'log-4', tenantId: 't1', userId: null, action: 'SYSTEM_JOB', createdAt: new Date() },
    ]);
    prisma.activityLog.count.mockResolvedValue(1);
    await service.list('t1', { page: 1, limit: 20 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [] } } }),
    );
  });
});

describe('ActivityLogService.cleanup', () => {
  let service: ActivityLogService;
  let prisma: { activityLog: { deleteMany: jest.Mock }; tenant: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      activityLog: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
      tenant: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ActivityLogService);
  });

  it('olderThanDays → cutoff صحیح محاسبه و حذف می‌شود', async () => {
    const result = await service.cleanup('t1', { olderThanDays: 90 });
    expect(result).toEqual({ deleted: 5 });
    const where = prisma.activityLog.deleteMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('before → همان تاریخ به‌عنوان cutoff استفاده می‌شود', async () => {
    const before = new Date('2026-01-01');
    await service.cleanup('t1', { before });
    const where = prisma.activityLog.deleteMany.mock.calls[0][0].where;
    expect(where.createdAt.lt).toBe(before);
  });

  it('all → every entry of this store is deleted', async () => {
    await service.cleanup('t1', { all: true });
    expect(prisma.activityLog.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
  });

  it('from/to → only that window is deleted; a reversed window → 400', async () => {
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-02T00:00:00Z');
    await service.cleanup('t1', { from, to });
    expect(prisma.activityLog.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', createdAt: { gte: from, lt: to } },
    });
    await expect(service.cleanup('t1', { from: to, to: from })).rejects.toThrow('from');
  });

  it('بدون before/olderThanDays → بدون حذف', async () => {
    const result = await service.cleanup('t1', {});
    expect(result).toEqual({ deleted: 0 });
    expect(prisma.activityLog.deleteMany).not.toHaveBeenCalled();
  });
});

describe('ActivityLogService.runAutoCleanup', () => {
  let service: ActivityLogService;
  let prisma: {
    tenant: { findMany: jest.Mock };
    activityLog: { deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tenant: { findMany: jest.fn() },
      activityLog: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ActivityLogService);
  });

  it('فقط فروشگاه‌های دارای activityLogRetentionDays معتبر پاک‌سازی می‌شوند', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 't1', slug: 's1', settings: { activityLogRetentionDays: 30 } },
      { id: 't2', slug: 's2', settings: {} },
      { id: 't3', slug: 's3', settings: { activityLogRetentionDays: 0 } },
      { id: 't4', slug: 's4', settings: null },
    ]);
    await service.runAutoCleanup();
    expect(prisma.activityLog.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1' }) }),
    );
  });

  it('خطای یک فروشگاه بقیه را متوقف نمی‌کند', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 't1', slug: 's1', settings: { activityLogRetentionDays: 30 } },
      { id: 't2', slug: 's2', settings: { activityLogRetentionDays: 60 } },
    ]);
    prisma.activityLog.deleteMany
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ count: 2 });
    await expect(service.runAutoCleanup()).resolves.toBeUndefined();
    expect(prisma.activityLog.deleteMany).toHaveBeenCalledTimes(2);
  });
});
