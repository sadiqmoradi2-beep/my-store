import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForTenant(tenantId: string) {
    return this.prisma.role.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      include: {
        rolePermissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  findTenantRole(tenantId: string, id: string) {
    return this.prisma.role.findFirst({
      where: { id, tenantId, isSystem: false },
      include: { _count: { select: { users: true } } },
    });
  }

  findAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ moduleKey: 'asc' }, { key: 'asc' }] });
  }

  findPermissionsByKeys(keys: string[]) {
    return this.prisma.permission.findMany({ where: { key: { in: keys } } });
  }

  create(tenantId: string, key: string, name: string, permissionIds: string[]) {
    return this.prisma.role.create({
      data: {
        tenantId,
        key,
        name,
        isSystem: false,
        rolePermissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
  }

  async update(id: string, name?: string, permissionIds?: string[]) {
    if (permissionIds) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      });
    }
    return this.prisma.role.update({ where: { id }, data: name ? { name } : {} });
  }

  delete(id: string) {
    return this.prisma.role.delete({ where: { id } });
  }
}
