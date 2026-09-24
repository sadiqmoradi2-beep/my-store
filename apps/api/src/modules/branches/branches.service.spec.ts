import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchesRepository } from './branches.repository';
import { BranchesService } from './branches.service';

describe('BranchesService', () => {
  let service: BranchesService;
  let repo: {
    findMany: jest.Mock;
    findById: jest.Mock;
    createWithDefaultWarehouse: jest.Mock;
    update: jest.Mock;
    createWarehouse: jest.Mock;
  };
  let prisma: {
    subscription: { findUnique: jest.Mock };
    branch: { count: jest.Mock };
  };

  const dto = { name: 'شعبه دوم', code: 'BR-2' };

  beforeEach(async () => {
    repo = {
      findMany: jest.fn(),
      findById: jest.fn(),
      createWithDefaultWarehouse: jest.fn().mockImplementation((tenantId, data) => ({
        id: 'branch-new',
        tenantId,
        isMain: false,
        ...data,
      })),
      update: jest.fn(),
      createWarehouse: jest.fn().mockImplementation((data) => ({ id: 'wh-new', ...data })),
    };
    prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { limits: { maxBranches: 3 } } }),
      },
      branch: { count: jest.fn().mockResolvedValue(1) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: BranchesRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(BranchesService);
  });

  it('ایجاد شعبه در سقف پلن → 400', async () => {
    prisma.branch.count.mockResolvedValue(3);
    await expect(service.create('t1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createWithDefaultWarehouse).not.toHaveBeenCalled();
  });

  it('ایجاد شعبه زیر سقف پلن → موفق', async () => {
    prisma.branch.count.mockResolvedValue(1);
    await service.create('t1', dto);
    expect(repo.createWithDefaultWarehouse).toHaveBeenCalledWith('t1', dto);
  });

  it('پلن نامحدود (maxBranches: -1) → بدون شمارش شعبه‌ها', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: { limits: { maxBranches: -1 } } });
    await service.create('t1', dto);
    expect(prisma.branch.count).not.toHaveBeenCalled();
    expect(repo.createWithDefaultWarehouse).toHaveBeenCalled();
  });

  it('حذف شعبه مرکزی غیرممکن است', async () => {
    repo.findById.mockResolvedValue({ id: 'b1', isMain: true });
    await expect(service.remove('t1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('حذف شعبه غیرمرکزی → موفق', async () => {
    repo.findById.mockResolvedValue({ id: 'b2', isMain: false });
    await service.remove('t1', 'b2');
    expect(repo.update).toHaveBeenCalledWith('b2', { isActive: false });
  });

  it('شعبه ناموجود → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('t1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('createWarehouse', () => {
    it('شعبه ناموجود → 404 و گدامی ساخته نمی‌شود', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.createWarehouse('t1', 'b-missing', { name: 'گدام دوم' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.createWarehouse).not.toHaveBeenCalled();
    });

    it('شعبه موجود → گدام جدید با نام/تلفن/صاحب ساخته می‌شود', async () => {
      repo.findById.mockResolvedValue({ id: 'b1' });
      await service.createWarehouse('t1', 'b1', {
        name: 'گدام دوم',
        phone: '0700000000',
        ownerName: 'احمد',
      });
      expect(repo.createWarehouse).toHaveBeenCalledWith({
        tenantId: 't1',
        branchId: 'b1',
        name: 'گدام دوم',
        phone: '0700000000',
        ownerName: 'احمد',
      });
    });
  });
});
