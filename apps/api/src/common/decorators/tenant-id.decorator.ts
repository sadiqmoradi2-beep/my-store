import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/** The current user's tenantId — throws a 403 for a Super Admin (no tenant) */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const user = ctx.switchToHttp().getRequest().user;
  if (!user?.tenantId) {
    throw new ForbiddenException('This operation requires a store account');
  }
  return user.tenantId;
});
