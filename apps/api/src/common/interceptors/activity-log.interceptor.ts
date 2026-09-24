import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../decorators/current-user.decorator';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const METHOD_VERBS: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};
/** Detects cuid identifiers in the path so they are excluded from the action */
const ID_LIKE = /^c[a-z0-9]{20,}$/;

/** Automatically logs write operations — fire-and-forget; the request body is not stored */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req: Request & { user?: RequestUser } = context.switchToHttp().getRequest();
    if (!MUTATING.has(req.method)) return next.handle();

    const res: Response = context.switchToHttp().getResponse();
    return next.handle().pipe(
      tap({
        next: () => this.log(req, res.statusCode),
        error: (err: { status?: number }) => this.log(req, err?.status ?? 500),
      }),
    );
  }

  private log(req: Request & { user?: RequestUser }, statusCode: number) {
    const segments = req.path.replace(/^\/api\/v\d+\//, '').split('/').filter(Boolean);
    if (segments.length === 0) return;
    const last = segments[segments.length - 1];
    const subAction = segments.length > 1 && !ID_LIKE.test(last) ? last : METHOD_VERBS[req.method];
    const entityId = segments.find((s) => ID_LIKE.test(s));

    this.prisma.activityLog
      .create({
        data: {
          tenantId: req.user?.tenantId ?? null,
          userId: req.user?.userId ?? null,
          method: req.method,
          path: req.path,
          action: `${segments[0]}.${subAction}`,
          entityId: entityId ?? null,
          statusCode,
          ip: req.ip ?? null,
        },
      })
      .catch(() => undefined);
  }
}
