import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { tenantContext } from '../common/tenant-context';

/** Models whose queries must all include tenantId */
const TENANT_SCOPED_MODELS = new Set([
  'Branch',
  'Warehouse',
  'Category',
  'Product',
  'PriceHistory',
  'Stock',
  'StockMovement',
  'Cart',
  'Order',
]);

const WHERE_CHECKED_OPS = new Set([
  'findMany',
  'findFirst',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

function whereHasTenantId(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;
  if ('tenantId' in w) return true;
  return ['AND', 'OR'].some(
    (key) => Array.isArray(w[key]) && (w[key] as unknown[]).every(whereHasTenantId),
  );
}

function dataHasTenant(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return 'tenantId' in d || 'tenant' in d;
}

/**
 * Development safeguard: in non-production environments, throws an error
 * if a query on a tenant-scoped model is missing tenantId, so cross-tenant
 * data leaks are caught early.
 */
const tenantGuard = Prisma.defineExtension({
  name: 'tenant-guard',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (process.env.NODE_ENV !== 'production' && model && TENANT_SCOPED_MODELS.has(model)) {
          const a = args as { where?: unknown; data?: unknown };
          if (WHERE_CHECKED_OPS.has(operation) && !whereHasTenantId(a.where)) {
            throw new Error(`[tenant-guard] ${model}.${operation} without tenantId in where`);
          }
          if (operation === 'create' && !dataHasTenant(a.data)) {
            throw new Error(`[tenant-guard] ${model}.create without tenantId in data`);
          }
          if (operation === 'createMany') {
            const rows = ((a.data ?? []) as unknown[]).flat();
            if (!rows.every(dataHasTenant)) {
              throw new Error(`[tenant-guard] ${model}.createMany row without tenantId`);
            }
          }
        }
        return query(args);
      },
    },
  },
});

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Guarded client — the default path used by repositories */
  readonly client = this.$extends(tenantGuard);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Interactive transaction with RLS context: if the current tenant is
   * known, app.tenant_id is set at the start of the transaction so Postgres
   * policies are enforced. (Active in production with a non-superuser
   * database role.)
   */
  override $transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R>;
  override $transaction<P extends Prisma.PrismaPromise<unknown>[]>(
    operations: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<unknown[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override $transaction(arg: unknown, options?: unknown): Promise<any> {
    if (typeof arg !== 'function') {
      return super.$transaction(arg as never, options as never);
    }
    const run = arg as (tx: Prisma.TransactionClient) => Promise<unknown>;
    return super.$transaction(async (tx: Prisma.TransactionClient) => {
      const tenantId = tenantContext.getStore();
      if (tenantId) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      }
      return run(tx);
    }, options as never);
  }
}
