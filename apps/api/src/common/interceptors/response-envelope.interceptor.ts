import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map, Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { signUploadRefs, stripUploadSignatures } from '../uploads/signed-upload-url';

/** Decimal → string and Date → ISO; applied recursively over the whole response body */
export function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialize(v)]),
    );
  }
  return value;
}

interface PaginatedPayload {
  items: unknown[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

function isPaginated(data: unknown): data is PaginatedPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    'meta' in data &&
    Array.isArray((data as PaginatedPayload).items)
  );
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ body?: unknown; user?: { tenantId?: string | null } }>();
    // a signed upload link sent back by the browser is stored as its plain path (never with a signature)
    if (req?.body && typeof req.body === 'object') req.body = stripUploadSignatures(req.body);
    const secret = this.config.get<string>('jwt.secret')!;
    // upload paths of the caller's own store become short-lived signed links (no user → nothing is signed)
    const sign = (value: unknown) => (req?.user ? signUploadRefs(value, req.user.tenantId ?? null, secret) : value);
    return next.handle().pipe(
      map((data) => {
        if (isPaginated(data)) {
          return { success: true, data: sign(serialize(data.items)), meta: data.meta };
        }
        return { success: true, data: sign(serialize(data)) };
      }),
    );
  }
}
