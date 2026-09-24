import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map, Observable } from 'rxjs';

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
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (isPaginated(data)) {
          return { success: true, data: serialize(data.items), meta: data.meta };
        }
        return { success: true, data: serialize(data) };
      }),
    );
  }
}
