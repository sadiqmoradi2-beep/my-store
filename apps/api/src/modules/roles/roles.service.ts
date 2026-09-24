import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesRepository } from './roles.repository';

@Injectable()
export class RolesService {
  constructor(private readonly repo: RolesRepository) {}

  async list(tenantId: string) {
    const roles = await this.repo.findAllForTenant(tenantId);
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.rolePermissions.map((rp) => rp.permission.key),
    }));
  }

  listPermissions() {
    return this.repo.findAllPermissions();
  }

  async create(tenantId: string, dto: CreateRoleDto) {
    const permissions = await this.resolvePermissions(dto.permissionKeys);
    try {
      return await this.repo.create(tenantId, dto.key, dto.name, permissions);
    } catch {
      throw new ConflictException('A role with this key already exists');
    }
  }

  async update(tenantId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.repo.findTenantRole(tenantId, id);
    if (!role) throw new NotFoundException('Custom role not found (system roles cannot be edited)');
    const permissionIds = dto.permissionKeys
      ? await this.resolvePermissions(dto.permissionKeys)
      : undefined;
    return this.repo.update(id, dto.name, permissionIds);
  }

  async remove(tenantId: string, id: string) {
    const role = await this.repo.findTenantRole(tenantId, id);
    if (!role) throw new NotFoundException('Custom role not found');
    if (role._count.users > 0) {
      throw new BadRequestException('This role is assigned to users and cannot be deleted');
    }
    await this.repo.delete(id);
    return { deleted: true };
  }

  private async resolvePermissions(keys: string[]): Promise<string[]> {
    const permissions = await this.repo.findPermissionsByKeys(keys);
    if (permissions.length !== keys.length) {
      const found = new Set(permissions.map((p) => p.key));
      const invalid = keys.filter((k) => !found.has(k));
      throw new BadRequestException(`Invalid permission(s): ${invalid.join(', ')}`);
    }
    return permissions.map((p) => p.id);
  }
}
