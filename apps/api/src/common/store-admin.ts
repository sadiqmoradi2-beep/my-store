import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLES } from '@my-store/shared';

type Db = Pick<Prisma.TransactionClient, 'user'>;

/**
 * The store's real Admin: the built-in system ADMIN role (tenantId null, isSystem) — checked on the live
 * database row, not the token. A custom role that happens to use the key ADMIN, and the platform
 * Super Admin, are refused.
 */
export async function assertRealStoreAdmin(db: Db, tenantId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      fullName: true,
      passwordHash: true,
      totpSecret: true,
      totpEnabledAt: true,
      role: { select: { key: true, tenantId: true, isSystem: true } },
    },
  });
  if (!user || user.role.key !== ROLES.ADMIN || user.role.tenantId !== null || !user.role.isSystem) {
    throw new ForbiddenException('Only the Store Admin can do this');
  }
  return user;
}
