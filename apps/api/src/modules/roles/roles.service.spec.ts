import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PERMISSIONS } from '@my-store/shared';
import { RolePermissionsCacheService } from '../../common/role-permissions-cache.service';
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
  let permissionsCache: { invalidate: jest.Mock };

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
    permissionsCache = { invalidate: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: RolesRepository, useValue: repo },
        { provide: RolePermissionsCacheService, useValue: permissionsCache },
      ],
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

  it('update/remove invalidate the role\'s cached permission set immediately, instead of waiting out the TTL', async () => {
    repo.findTenantRole.mockResolvedValue({ id: 'role-1', _count: { users: 0 } });
    await service.update('t1', 'role-1', { permissionKeys: ['orders.view'] });
    expect(permissionsCache.invalidate).toHaveBeenCalledWith('role-1');

    permissionsCache.invalidate.mockClear();
    await service.remove('t1', 'role-1');
    expect(permissionsCache.invalidate).toHaveBeenCalledWith('role-1');
  });

  it('platform-only permission key on a tenant role → 403, never reaches the repository (privilege-escalation guard)', async () => {
    await expect(
      service.create('t1', {
        key: 'FAKE_ADMIN',
        name: 'Fake platform admin',
        permissionKeys: [PERMISSIONS.TENANTS_MANAGE_ALL],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.findPermissionsByKeys).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('platform-only permission key on a tenant role update → 403', async () => {
    repo.findTenantRole.mockResolvedValue({ id: 'role-1', _count: { users: 0 } });
    await expect(
      service.update('t1', 'role-1', { permissionKeys: [PERMISSIONS.SUBSCRIPTION_APPROVE] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('listPermissions excludes platform-only keys from what a tenant admin can assign', async () => {
    repo.findAllPermissions.mockResolvedValue([
      { id: 'p1', key: 'orders.view' },
      { id: 'p2', key: PERMISSIONS.TENANTS_MANAGE_ALL },
      { id: 'p3', key: PERMISSIONS.SUBSCRIPTION_APPROVE },
      { id: 'p4', key: PERMISSIONS.PLANS_MANAGE },
      { id: 'p5', key: PERMISSIONS.FEEDBACK_MANAGE },
    ]);
    const result = await service.listPermissions();
    expect(result.map((p) => p.key)).not.toEqual(
      expect.arrayContaining([
        PERMISSIONS.TENANTS_MANAGE_ALL,
        PERMISSIONS.SUBSCRIPTION_APPROVE,
        PERMISSIONS.PLANS_MANAGE,
        PERMISSIONS.FEEDBACK_MANAGE,
      ]),
    );
  });
});
