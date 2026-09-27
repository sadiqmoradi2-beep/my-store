import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * The branch's default warehouse — created on first use. A full data reset deletes warehouses,
 * so a branch may have none until something needs it again.
 */
export async function findDefaultWarehouse(db: Db, tenantId: string, branch: { id: string; name: string }) {
  const existing = await db.warehouse.findFirst({
    where: { tenantId, branchId: branch.id, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (existing) return existing;
  return db.warehouse.create({
    data: { tenantId, branchId: branch.id, name: `${branch.name} Warehouse`, isDefault: true },
  });
}
