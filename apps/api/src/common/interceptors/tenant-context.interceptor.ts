import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantContext } from '../tenant-context';

/** Runs the handler inside AsyncLocalStorage with the user's tenantId — the basis for RLS */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenantId: string | undefined = context.switchToHttp().getRequest().user?.tenantId;
    if (!tenantId) return next.handle();
    return new Observable((subscriber) => {
      const subscription = tenantContext.run(tenantId, () => next.handle().subscribe(subscriber));
      return () => subscription.unsubscribe();
    });
  }
}
