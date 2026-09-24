import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    countProducts: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      create: jest.fn().mockImplementation((tenantId, data) => ({ id: 'new-cat', tenantId, ...data })),
      update: jest.fn(),
      countProducts: jest.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: CategoriesRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  it('ساخت درخت تودرتو از دسته‌های تخت', async () => {
    repo.findAll.mockResolvedValue([
      {
        id: 'c1',
        parentId: null,
        name: 'اصلی',
        slug: 'main',
        imageUrl: null,
        sortOrder: 0,
        isActive: true,
        _count: { products: 2 },
      },
      {
        id: 'c2',
        parentId: 'c1',
        name: 'زیر',
        slug: 'sub',
        imageUrl: null,
        sortOrder: 0,
        isActive: true,
        _count: { products: 1 },
      },
    ]);

    const result = await service.tree('t1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].id).toBe('c2');
    expect(result[0].productCount).toBe(2);
  });

  it('ایجاد با parentId نامعتبر → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.create('t1', { name: 'الف', slug: 'alef', parentId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('دسته نمی‌تواند والد خودش باشد', async () => {
    repo.findById.mockResolvedValue({ id: 'c1', children: [] });
    await expect(service.update('t1', 'c1', { parentId: 'c1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('جلوگیری از حلقه: والد جدید نباید از نوادگان همین دسته باشد', async () => {
    repo.findById.mockResolvedValue({ id: 'c1', children: [] });
    repo.findAll.mockResolvedValue([
      { id: 'c1', parentId: null },
      { id: 'c2', parentId: 'c1' },
      { id: 'c3', parentId: 'c2' },
    ]);

    await expect(service.update('t1', 'c1', { parentId: 'c3' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('حذف دسته دارای زیر دسته غیرممکن است', async () => {
    repo.findById.mockResolvedValue({ id: 'c1', children: [{ id: 'c2' }] });
    await expect(service.remove('t1', 'c1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.countProducts).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('حذف دسته دارای محصول غیرممکن است', async () => {
    repo.findById.mockResolvedValue({ id: 'c1', children: [] });
    repo.countProducts.mockResolvedValue(3);
    await expect(service.remove('t1', 'c1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
