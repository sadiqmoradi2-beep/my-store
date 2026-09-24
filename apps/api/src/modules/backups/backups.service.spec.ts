import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUTO_BACKUP_KEEP } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupsService } from './backups.service';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  rm: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const mkdirMock = mkdir as jest.Mock;
const readFileMock = readFile as jest.Mock;
const rmMock = rm as jest.Mock;
const writeFileMock = writeFile as jest.Mock;

function buildPayload(overrides: {
  tenantId?: string;
  version?: number;
  data?: Record<string, unknown[]>;
} = {}) {
  return {
    version: overrides.version ?? 1,
    tenantId: overrides.tenantId ?? 't1',
    createdAt: '2026-07-20T00:00:00.000Z',
    tenant: { name: 'فروشگاه ۱', slug: 'shop-1' },
    data: {
      order: [{ id: 'o1', tenantId: 't1' }],
      orderItem: [{ id: 'oi1', orderId: 'o1' }],
      user: [],
      ...overrides.data,
    },
  };
}

describe('BackupsService', () => {
  let service: BackupsService;
  let prisma: Record<string, any>;
  let callOrder: string[];
  let txCache: Record<
    string,
    { deleteMany: jest.Mock; createMany: jest.Mock; create: jest.Mock; findMany: jest.Mock; update: jest.Mock }
  >;
  let txOptsCaptured: unknown;

  function txDelegate(key: string) {
    if (!txCache[key]) {
      txCache[key] = {
        deleteMany: jest.fn().mockImplementation(() => {
          callOrder.push(`delete:${key}`);
          return Promise.resolve({ count: 0 });
        }),
        createMany: jest.fn().mockImplementation((args: { data: unknown[] }) => {
          callOrder.push(`create:${key}`);
          return Promise.resolve({ count: args?.data?.length ?? 0 });
        }),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      };
    }
    return txCache[key];
  }

  beforeEach(async () => {
    callOrder = [];
    txCache = {};
    txOptsCaptured = undefined;
    const txProxy = new Proxy(
      {},
      { get: (_t, prop: string) => txDelegate(prop) },
    );

    const cache: Record<string, any> = {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't1', name: 'فروشگاه ۱', slug: 'shop-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      backup: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'bk-new', ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', tenantId: 't1' }]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown, opts?: unknown) => {
        txOptsCaptured = opts;
        return cb(txProxy);
      }),
    };
    prisma = new Proxy(cache, {
      get(target, prop: string) {
        if (!(prop in target)) {
          target[prop] = { findMany: jest.fn().mockResolvedValue([]) };
        }
        return target[prop];
      },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [BackupsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(BackupsService);
    jest.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
  });

  describe('create', () => {
    it('MANUAL: فایل نوشته می‌شود و دادهٔ هر مدل با فیلتر tenantId جمع‌آوری می‌شود', async () => {
      const backup = await service.create('t1', 'MANUAL', 'u1', 'یادداشت');
      expect(writeFileMock).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(writeFileMock.mock.calls[0][1] as string);
      expect(payload.tenantId).toBe('t1');
      expect(payload.data.product).toEqual([{ id: 'p1', tenantId: 't1' }]);
      expect(prisma.backup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            type: 'MANUAL',
            note: 'یادداشت',
            createdById: 'u1',
            fileName: expect.stringMatching(/^backup-.*\.json$/),
          }),
        }),
      );
      expect(backup).toEqual(expect.objectContaining({ type: 'MANUAL' }));
    });

    it('AUTO: بدون یادداشت/کاربر ایجادکننده', async () => {
      await service.create('t1', 'AUTO');
      const data = prisma.backup.create.mock.calls[0][0].data;
      expect(data.type).toBe('AUTO');
      expect(data.note).toBeUndefined();
      expect(data.createdById).toBeUndefined();
    });
  });

  describe('restore', () => {
    beforeEach(() => {
      prisma.backup.findFirst.mockResolvedValue({
        id: 'bk1',
        tenantId: 't1',
        fileName: 'backup-x.json',
        status: 'COMPLETED',
      });
      readFileMock.mockResolvedValue(JSON.stringify(buildPayload()));
    });

    it('در یک تراکنش با timeout مناسب اجرا می‌شود', async () => {
      await service.restore('t1', 'bk1', 'me1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txOptsCaptured).toEqual({ timeout: 300_000 });
    });

    it('ترتیب صحیح: فرزند (orderItem) قبل از والد (order) حذف؛ والد قبل از فرزند درج می‌شود', async () => {
      await service.restore('t1', 'bk1', 'me1');
      const deleteOrder = callOrder.indexOf('delete:order');
      const deleteOrderItem = callOrder.indexOf('delete:orderItem');
      const createOrder = callOrder.indexOf('create:order');
      const createOrderItem = callOrder.indexOf('create:orderItem');
      expect(deleteOrderItem).toBeGreaterThanOrEqual(0);
      expect(deleteOrderItem).toBeLessThan(deleteOrder);
      expect(createOrder).toBeGreaterThanOrEqual(0);
      expect(createOrder).toBeLessThan(createOrderItem);
    });

    it('فایل پشتیبان متعلق به فروشگاه دیگر → خطا و بدون تراکنش', async () => {
      readFileMock.mockResolvedValue(JSON.stringify(buildPayload({ tenantId: 't2' })));
      await expect(service.restore('t1', 'bk1', 'me1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('پشتیبان ناقص (status≠COMPLETED) → خطا', async () => {
      prisma.backup.findFirst.mockResolvedValue({
        id: 'bk1',
        tenantId: 't1',
        fileName: 'x.json',
        status: 'FAILED',
      });
      await expect(service.restore('t1', 'bk1', 'me1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('کاربر بازیابی‌کننده در دادهٔ پشتیبان نبود → دوباره ساخته می‌شود', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'me1', email: 'me@x.com', uiPrefs: null });
      readFileMock.mockResolvedValue(
        JSON.stringify(buildPayload({ data: { user: [{ id: 'other', email: 'other@x.com' }] } })),
      );
      await service.restore('t1', 'bk1', 'me1');
      expect(txCache.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: 'me1', branchId: null }) }),
      );
    });

    it('کاربر بازیابی‌کننده در دادهٔ پشتیبان بود → دوباره ساخته نمی‌شود', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'me1', email: 'me@x.com', uiPrefs: null });
      readFileMock.mockResolvedValue(
        JSON.stringify(buildPayload({ data: { user: [{ id: 'me1', email: 'me@x.com' }] } })),
      );
      await service.restore('t1', 'bk1', 'me1');
      expect(txCache.user.create).not.toHaveBeenCalled();
    });
  });

  describe('wipeData', () => {
    it('قبل از پاک‌سازی، یک پشتیبان ایمنی MANUAL گرفته می‌شود', async () => {
      await service.wipeData('t1', 'u1');
      expect(writeFileMock).toHaveBeenCalledTimes(1);
      expect(prisma.backup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 't1', type: 'MANUAL', createdById: 'u1' }),
        }),
      );
    });

    it('دادهٔ کسب‌وکاری حذف می‌شود ولی ساختار حساب دست‌نخورده می‌ماند', async () => {
      await service.wipeData('t1', 'u1');
      expect(callOrder).toContain('delete:order');
      expect(callOrder).toContain('delete:orderItem');
      expect(callOrder).toContain('delete:supplier');
      expect(callOrder).not.toContain('delete:user');
      expect(callOrder).not.toContain('delete:role');
      expect(callOrder).not.toContain('delete:branch');
      expect(callOrder).not.toContain('delete:warehouse');
      expect(callOrder).not.toContain('delete:cashRegister');
      expect(callOrder).not.toContain('delete:employee');
      expect(callOrder).not.toContain('delete:category');
      expect(callOrder).not.toContain('create:order'); // فقط حذف — بدون درج دوباره
    });

    it('در یک تراکنش با timeout مناسب اجرا می‌شود', async () => {
      await service.wipeData('t1', 'u1');
      expect(txOptsCaptured).toEqual({ timeout: 300_000 });
    });

    it('scope=NOTIFICATIONS → only deletes notifications, nothing else', async () => {
      await service.wipeData('t1', 'u1', 'NOTIFICATIONS');
      expect(callOrder).toEqual(['delete:notification']);
      expect(txCache.cashRegister).toBeUndefined();
    });

    it('scope=DEBTS → deletes debt payments and debts only, no register balance reset', async () => {
      await service.wipeData('t1', 'u1', 'DEBTS');
      expect(callOrder).toEqual(['delete:debtPayment', 'delete:debt']);
      expect(txCache.cashRegister).toBeUndefined();
    });

    it('scope=CASH → deletes cash-related rows and resets register balances', async () => {
      txCache.cashRegister = {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'reg1', openingBalance: 100 }]),
        update: jest.fn(),
      };
      await service.wipeData('t1', 'u1', 'CASH');
      expect(callOrder).toEqual(['delete:payment', 'delete:cashTransaction', 'delete:gatewayIntent']);
      expect(txCache.cashRegister.update).toHaveBeenCalledWith({
        where: { id: 'reg1' },
        data: { balance: 100 },
      });
    });
  });

  describe('runAutoBackups', () => {
    it('فقط فروشگاه‌های فعال با autoBackup=true پشتیبان می‌گیرند', async () => {
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', slug: 's1', isActive: true, settings: { autoBackup: true } },
        { id: 't2', slug: 's2', isActive: true, settings: { autoBackup: false } },
        { id: 't3', slug: 's3', isActive: true, settings: {} },
      ]);
      const createSpy = jest.spyOn(service, 'create').mockResolvedValue({} as never);
      await service.runAutoBackups();
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith('t1', 'AUTO');
    });

    it('نگه‌داشتن ۷ پشتیبان AUTO آخر: مازاد حذف می‌شود', async () => {
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', slug: 's1', isActive: true, settings: { autoBackup: true } },
      ]);
      jest.spyOn(service, 'create').mockResolvedValue({} as never);
      prisma.backup.findMany.mockResolvedValue([
        { id: 'old1', fileName: 'backup-1.json' },
        { id: 'old2', fileName: 'backup-2.json' },
      ]);
      await service.runAutoBackups();
      expect(prisma.backup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't1', type: 'AUTO' }, skip: AUTO_BACKUP_KEEP }),
      );
      expect(prisma.backup.delete).toHaveBeenCalledTimes(2);
      expect(rmMock).toHaveBeenCalledTimes(2);
    });

    it('شکست پشتیبان‌گیری خودکار → ثبت ردیف Backup با status=FAILED', async () => {
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', slug: 's1', isActive: true, settings: { autoBackup: true } },
      ]);
      jest.spyOn(service, 'create').mockRejectedValue(new Error('disk full'));
      await service.runAutoBackups();
      expect(prisma.backup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 't1', type: 'AUTO', status: 'FAILED' }),
        }),
      );
    });
  });
});
