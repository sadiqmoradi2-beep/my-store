import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The current request's tenantId — populated by TenantContextInterceptor
 * and used by PrismaService for RLS (set_config('app.tenant_id')).
 */
export const tenantContext = new AsyncLocalStorage<string>();
