import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES } from '@my-store/shared';
import { MODULE_KEY } from '../decorators/require-module.decorator';
import { RequestUser } from '../decorators/current-user.decorator';
import { ModuleAccessService } from '../../modules/tenant-modules/module-access.service';

/** Feature gating: routes with @RequireModule only work when the module is enabled and the plan allows it */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleAccess: ModuleAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleKey) return true;

    const user: RequestUser | undefined = context.switchToHttp().getRequest().user;
    if (!user?.tenantId || user.roleKey === ROLES.SUPER_ADMIN) return true;

    if (!(await this.moduleAccess.isEnabled(user.tenantId, moduleKey))) {
      throw new ForbiddenException('This module is not enabled for your store');
    }
    return true;
  }
}
