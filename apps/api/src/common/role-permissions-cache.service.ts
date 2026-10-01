import { Injectable } from '@nestjs/common';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

/**
 * Shared with PermissionsGuard: a role's permission set, cached for 60s to avoid a DB round
 * trip on every request. RolesService invalidates a role's entry immediately on update/delete,
 * so a permission revocation takes effect right away instead of riding out the TTL.
 */
@Injectable()
export class RolePermissionsCacheService {
  private readonly cache = new Map<string, CacheEntry>();

  get(roleId: string): Set<string> | undefined {
    const cached = this.cache.get(roleId);
    if (cached && cached.expiresAt > Date.now()) return cached.permissions;
    return undefined;
  }

  set(roleId: string, permissions: Set<string>): void {
    this.cache.set(roleId, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  invalidate(roleId: string): void {
    this.cache.delete(roleId);
  }
}
