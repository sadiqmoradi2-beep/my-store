import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { CREATE_PERMISSION_OF_TYPE, PERMISSIONS, ROLES } from '@my-store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './decorators/current-user.decorator';
import { RolePermissionsCacheService } from './role-permissions-cache.service';

/**
 * Who may create which money movement. cash.transact (Cashier, Branch Manager, Admin) keeps covering every
 * manual type; a Financial Personnel login gets only the granular capabilities the Store Admin granted, and
 * may only use accounts of its own branch.
 */
@Injectable()
export class FinancialAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RolePermissionsCacheService,
  ) {}

  /** Same source and cache as PermissionsGuard, so a revocation takes effect at once */
  async permissionsOf(user: RequestUser): Promise<Set<string>> {
    const cached = this.cache.get(user.roleId);
    if (cached) return cached;
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId: user.roleId },
      include: { permission: { select: { key: true } } },
    });
    const permissions = new Set(rows.map((r) => r.permission.key));
    this.cache.set(user.roleId, permissions);
    return permissions;
  }

  async assertAny(user: RequestUser, keys: string[], what: string) {
    if (user.roleKey === ROLES.SUPER_ADMIN) return;
    const permissions = await this.permissionsOf(user);
    if (!keys.some((k) => permissions.has(k))) throw new ForbiddenException(`You are not allowed to ${what}`);
  }

  assertCreateType(user: RequestUser, type: 'INCOME' | 'EXPENSE' | 'WITHDRAWAL') {
    return this.assertAny(user, [PERMISSIONS.CASH_TRANSACT, CREATE_PERMISSION_OF_TYPE[type]], `create ${type.toLowerCase()} transactions`);
  }

  assertTransfer(user: RequestUser) {
    return this.assertAny(user, [PERMISSIONS.CASH_MANAGE, PERMISSIONS.CASH_TRANSFER_CREATE], 'create internal transfers');
  }

  /** A Financial Personnel login may only use accounts of the branch it is assigned to */
  async assertBranchScope(tenantId: string, userId: string, registerIds: string[]) {
    const person = await this.prisma.teamPerson.findFirst({
      where: { tenantId, userId },
      select: { user: { select: { branchId: true } } },
    });
    if (!person) return;
    const branchId = person.user?.branchId;
    const registers = await this.prisma.cashRegister.findMany({ where: { tenantId, id: { in: registerIds } }, select: { branchId: true } });
    if (!branchId || registers.some((r) => r.branchId !== branchId)) {
      throw new ForbiddenException('You can only use the accounts of your own branch');
    }
  }
}

@Global()
@Module({ providers: [FinancialAccessService], exports: [FinancialAccessService] })
export class FinancialAccessModule {}
