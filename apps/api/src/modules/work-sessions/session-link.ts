import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** The active work session of the seller / employee this login belongs to (if any) */
export async function findActiveSessionIdForUser(db: Db, tenantId: string, userId: string): Promise<string | null> {
  const session = await db.workSession.findFirst({
    where: {
      tenantId,
      status: 'ACTIVE',
      OR: [{ seller: { userId } }, { employee: { userId } }],
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  return session?.id ?? null;
}

/**
 * Which work session a cash movement belongs to:
 * - not given (undefined) → the performer's own active session, if they have one
 * - null / empty → none (the main cash box)
 * - an id → that session, which must be active
 */
export async function resolveSessionId(
  db: Db,
  tenantId: string,
  userId: string,
  requested?: string | null,
): Promise<string | null> {
  if (requested === undefined) return findActiveSessionIdForUser(db, tenantId, userId);
  if (requested === null || requested === '') return null;
  const session = await db.workSession.findFirst({
    where: { id: requested, tenantId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!session) throw new UnprocessableEntityException('The selected work session is not active');
  return session.id;
}
