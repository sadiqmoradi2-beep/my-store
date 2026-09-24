import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionKey, ROLES } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RequestUser } from '../decorators/current-user.decorator';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user: RequestUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) return false;
    if (user.roleKey === ROLES.SUPER_ADMIN) return true;

    const permissions = await this.getRolePermissions(user.roleId);
    const missing = required.filter((p) => !permissions.has(p));
    if (missing.length) {
      throw new ForbiddenException(`You do not have the required permissions: ${missing.join(', ')}`);
    }
    return true;
  }

  private async getRolePermissions(roleId: string): Promise<Set<string>> {
    const cached = this.cache.get(roleId);
    if (cached && cached.expiresAt > Date.now()) return cached.permissions;

    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: { select: { key: true } } },
    });
    const permissions = new Set(rows.map((r) => r.permission.key));
    this.cache.set(roleId, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
    return permissions;
  }
}
