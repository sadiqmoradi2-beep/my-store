import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from './module-access.service';

describe('ModuleAccessService', () => {
  let service: ModuleAccessService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { code: 'BUSINESS' } }),
      },
      tenantModule: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ModuleAccessService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ModuleAccessService);
  });

  describe('stateOf / isEnabled — قرارداد پیش‌فرض فعال', () => {
    it('بدون ردیف TenantModule → ماژول فعال است (default-on)', async () => {
      const enabled = await service.isEnabled('t1', 'suppliers');
      expect(enabled).toBe(true);
    });

    it('ردیف صریح enabled=false → ماژول غیرفعال است', async () => {
      prisma.tenantModule.findMany.mockResolvedValue([{ module: { key: 'suppliers' } }]);
      const enabled = await service.isEnabled('t1', 'suppliers');
      expect(enabled).toBe(false);
    });

    it('ماژول هسته همیشه فعال است حتی اگر ردیف غیرفعال داشته باشد', async () => {
      prisma.tenantModule.findMany.mockResolvedValue([{ module: { key: 'products' } }]);
      const enabled = await service.isEnabled('t1', 'products');
      expect(enabled).toBe(true);
    });

    it('کلید ماژول ناشناخته → مسدود نمی‌شود (true)', async () => {
      const enabled = await service.isEnabled('t1', 'not-a-real-module');
      expect(enabled).toBe(true);
    });

    it('every module is available on the Free plan (plans differ only by limits)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: { code: 'FREE' } });
      for (const key of ['suppliers', 'partners', 'activity-log', 'backups', 'work-sessions', 'reports']) {
        expect(await service.isEnabled('t1', key)).toBe(true);
      }
    });
  });

  describe('کش وضعیت', () => {
    it('در بازه TTL دوباره کوئری اجرا نمی‌شود', async () => {
      await service.stateOf('t1');
      await service.stateOf('t1');
      expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.tenantModule.findMany).toHaveBeenCalledTimes(1);
    });

    it('invalidate → کش پاک می‌شود و کوئری بعدی دوباره اجرا می‌شود', async () => {
      await service.stateOf('t1');
      service.invalidate('t1');
      await service.stateOf('t1');
      expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(2);
    });

    it('فروشگاه‌های مختلف کش جداگانه دارند', async () => {
      await service.stateOf('t1');
      await service.stateOf('t2');
      expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
