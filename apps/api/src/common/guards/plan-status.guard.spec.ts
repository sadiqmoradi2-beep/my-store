import { ForbiddenException } from '@nestjs/common';
import { PlanStatusGuard } from './plan-status.guard';

function ctx(method: string, url: string, user: unknown) {
  return { switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, user }) }) } as never;
}

describe('PlanStatusGuard', () => {
  const stopped = { stateOf: jest.fn().mockResolvedValue({ planStopped: true }) };
  const active = { stateOf: jest.fn().mockResolvedValue({ planStopped: false }) };
  const owner = { tenantId: 't1', roleKey: 'ADMIN' };

  it('stopped plan: any change is refused', async () => {
    const guard = new PlanStatusGuard(stopped as never);
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      await expect(guard.canActivate(ctx(method, '/api/v1/products', owner))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('stopped plan: reading and auth routes still work', async () => {
    const guard = new PlanStatusGuard(stopped as never);
    await expect(guard.canActivate(ctx('GET', '/api/v1/products', owner))).resolves.toBe(true);
    await expect(guard.canActivate(ctx('POST', '/api/v1/auth/logout', owner))).resolves.toBe(true);
  });

  it('active plan, super admin, or no store → allowed', async () => {
    await expect(new PlanStatusGuard(active as never).canActivate(ctx('POST', '/api/v1/products', owner))).resolves.toBe(true);
    const guard = new PlanStatusGuard(stopped as never);
    await expect(guard.canActivate(ctx('POST', '/api/v1/tenants/t1/plan/resume', { tenantId: null, roleKey: 'SUPER_ADMIN' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx('POST', '/api/v1/auth/login', undefined))).resolves.toBe(true);
  });
});
