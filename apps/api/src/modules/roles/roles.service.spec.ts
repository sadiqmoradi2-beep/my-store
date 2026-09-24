import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let repo: {
    findAllForTenant: jest.Mock;
    findAllPermissions: jest.Mock;
    findPermissionsByKeys: jest.Mock;
    findTenantRole: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findAllForTenant: jest.fn(),
      findAllPermissions: jest.fn(),
      findPermissionsByKeys: jest.fn().mockResolvedValue([{ id: 'p1', key: 'orders.view' }]),
      findTenantRole: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'role-new' }),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [RolesService, { provide: RolesRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(RolesService);
  });

  it('کلید permission نامعتبر → 400', async () => {
    await expect(
      service.create('t1', { key: 'MANAGER', name: 'مدیر', permissionKeys: ['orders.view', 'bad.key'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('ایجاد نقش با کلید تکراری → 409', async () => {
    repo.create.mockRejectedValue(new Error('unique constraint failed'));
    await expect(
      service.create('t1', { key: 'DUP', name: 'تکراری', permissionKeys: ['orders.view'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('حذف نقش سیستمی یا متعلق به فروشگاه دیگر → 404', async () => {
    repo.findTenantRole.mockResolvedValue(null);
    await expect(service.remove('t1', 'role-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('حذف نقشی که به کاربران اختصاص دارد غیرممکن است', async () => {
    repo.findTenantRole.mockResolvedValue({ id: 'role-1', _count: { users: 2 } });
    await expect(service.remove('t1', 'role-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('حذف نقش بدون کاربر → موفق', async () => {
    repo.findTenantRole.mockResolvedValue({ id: 'role-1', _count: { users: 0 } });
    await service.remove('t1', 'role-1');
    expect(repo.delete).toHaveBeenCalledWith('role-1');
  });
});
