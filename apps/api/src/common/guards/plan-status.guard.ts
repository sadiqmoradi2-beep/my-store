import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ROLES } from '@my-store/shared';
import { RequestUser } from '../decorators/current-user.decorator';
import { ModuleAccessService } from '../../modules/tenant-modules/module-access.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A store whose plan was stopped by the platform admin is read-only: its users can still log in and
 * look at their data, but every change is refused until the plan is resumed. Auth routes stay open
 * (logout, password change, 2FA) so nobody is locked out of their own account.
 */
@Injectable()
export class PlanStatusGuard implements CanActivate {
  constructor(private readonly moduleAccess: ModuleAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;
    if (!user?.tenantId || user.roleKey === ROLES.SUPER_ADMIN) return true;
    if (READ_METHODS.has(request.method)) return true;
    if (String(request.originalUrl ?? request.url).includes('/auth/')) return true;

    const state = await this.moduleAccess.stateOf(user.tenantId);
    if (state.planStopped) {
      throw new ForbiddenException('Your plan has been stopped by the platform — contact support to resume it');
    }
    return true;
  }
}
