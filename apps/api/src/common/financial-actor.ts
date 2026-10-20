import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CREATE_PERMISSION_OF_TYPE, FINANCIAL_PERSONNEL_ROLE_PREFIX, PERMISSIONS, ROLES } from '@my-store/shared';

type Db = Pick<Prisma.TransactionClient, 'user' | 'teamPerson' | 'cashRegister'>;
export type MoneyOperation = 'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'TRANSFER' | 'EMPLOYEE_PAYMENT' | 'SELLER_PAYMENT' | 'PARTNER_PAYMENT';

/** Live identity, never a role key or actor supplied by the browser. No permissions are granted by a link. */
export async function financialIdentity(db: Db, tenantId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null, status: 'ACTIVE' },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } }, branch: true },
  });
  if (!user || (user.role.tenantId !== null && user.role.tenantId !== tenantId)) throw new ForbiddenException('Invalid financial operator');
  const isAdmin = user.role.key === ROLES.ADMIN && user.role.isSystem && user.role.tenantId === null;
  const linked = await db.teamPerson.findUnique({ where: { userId } });
  if (linked && (linked.tenantId !== tenantId || !linked.isActive || linked.archivedAt)) {
    throw new ForbiddenException('Financial Personnel identity is inactive or belongs to another store');
  }
  if (!linked && user.role.key.startsWith(FINANCIAL_PERSONNEL_ROLE_PREFIX)) throw new ForbiddenException('Financial Personnel login is unlinked');
  if (linked && (!user.branchId || !user.branch?.isActive || user.branch.tenantId !== tenantId)) throw new ForbiddenException('Financial Personnel needs an active branch');
  return { user, linked, isAdmin };
}

export async function resolveFinancialActor(
  db: Db, tenantId: string, userId: string, operation: MoneyOperation, registerIds: string[], selectedId?: string,
) {
  if (selectedId !== undefined && (typeof selectedId !== 'string' || !selectedId.trim())) throw new ForbiddenException('Invalid financial actor');
  const identity = await financialIdentity(db, tenantId, userId);
  const { user, linked, isAdmin } = identity;
  const permissions = new Set(user.role.rolePermissions.map((rp) => rp.permission.key));
  const allowed = operation === 'EMPLOYEE_PAYMENT' ? [PERMISSIONS.EMPLOYEES_MANAGE]
    : operation === 'SELLER_PAYMENT' ? [PERMISSIONS.SELLERS_MANAGE]
    : operation === 'PARTNER_PAYMENT' ? [PERMISSIONS.PARTNERS_MANAGE]
    : operation === 'TRANSFER'
    ? [PERMISSIONS.CASH_MANAGE, PERMISSIONS.CASH_TRANSFER_CREATE]
    : [PERMISSIONS.CASH_TRANSACT, CREATE_PERMISSION_OF_TYPE[operation]];
  if (!allowed.some((key) => permissions.has(key))) throw new ForbiddenException('Financial operation is not permitted');
  const ids = [...new Set(registerIds)];
  const accounts = await db.cashRegister.findMany({ where: { tenantId, id: { in: ids }, isActive: true, branch: { isActive: true } } });
  if (accounts.length !== ids.length) throw new ForbiddenException('Account is unavailable in this store');
  if (linked && accounts.some((a) => a.branchId !== user.branchId)) throw new ForbiddenException('You can only use the accounts of your own branch');
  if (!isAdmin && selectedId !== undefined && selectedId !== linked?.id) throw new ForbiddenException('You cannot select another financial actor');
  const actorId = isAdmin ? selectedId : linked?.id;
  if (!actorId) return { ...identity, accounts, actor: undefined };
  const person = await db.teamPerson.findFirst({
    where: { id: actorId, tenantId, isActive: true, archivedAt: null }, include: { user: { include: { branch: true } } },
  });
  if (!person || (person.user && (person.user.tenantId !== tenantId || person.user.deletedAt || person.user.status !== 'ACTIVE' ||
      !person.user.branch?.isActive || accounts.some((a) => a.branchId !== person.user!.branchId)))) {
    throw new ForbiddenException('Choose active Financial Personnel authorized for these accounts');
  }
  return { ...identity, accounts, actor: { kind: 'PERSON' as const, id: person.id, name: person.displayName } };
}
