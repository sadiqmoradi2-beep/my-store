import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS } from '@my-store/shared';
import { RolePermissionsCacheService } from '../../common/role-permissions-cache.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesRepository } from './roles.repository';

/** Platform-only permission keys — never grantable to a tenant-scoped (custom) role. */
const PLATFORM_ONLY_PERMISSIONS: readonly string[] = [
  PERMISSIONS.TENANTS_MANAGE_ALL,
  PERMISSIONS.SUBSCRIPTION_APPROVE,
  PERMISSIONS.PLANS_MANAGE,
  PERMISSIONS.FEEDBACK_MANAGE,
];

@Injectable()
export class RolesService {
  constructor(
    private readonly repo: RolesRepository,
    private readonly permissionsCache: RolePermissionsCacheService,
  ) {}

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

  async listPermissions() {
    const permissions = await this.repo.findAllPermissions();
    // Tenant admins create/edit only tenant-scoped roles, so platform-only
    // permissions must never appear as an assignable option here.
    return permissions.filter((p) => !PLATFORM_ONLY_PERMISSIONS.includes(p.key));
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
    const updated = await this.repo.update(id, dto.name, permissionIds);
    // A permission change must take effect immediately, not after the guard's cache TTL expires
    this.permissionsCache.invalidate(id);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    const role = await this.repo.findTenantRole(tenantId, id);
    if (!role) throw new NotFoundException('Custom role not found');
    if (role._count.users > 0) {
      throw new BadRequestException('This role is assigned to users and cannot be deleted');
    }
    await this.repo.delete(id);
    this.permissionsCache.invalidate(id);
    return { deleted: true };
  }

  private async resolvePermissions(keys: string[]): Promise<string[]> {
    const platformOnly = keys.filter((k) => PLATFORM_ONLY_PERMISSIONS.includes(k));
    if (platformOnly.length > 0) {
      throw new ForbiddenException(
        `Platform-only permission(s) cannot be assigned to a store role: ${platformOnly.join(', ')}`,
      );
    }
    const permissions = await this.repo.findPermissionsByKeys(keys);
    if (permissions.length !== keys.length) {
      const found = new Set(permissions.map((p) => p.key));
      const invalid = keys.filter((k) => !found.has(k));
      throw new BadRequestException(`Invalid permission(s): ${invalid.join(', ')}`);
    }
    return permissions.map((p) => p.id);
  }
}
