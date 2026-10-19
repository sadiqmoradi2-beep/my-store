import { Prisma } from '@prisma/client';
import { storeDayEndUtc, storeDayStartUtc, storeTimeZoneOf } from '@my-store/shared';

type Db = Prisma.TransactionClient | { tenant: Prisma.TransactionClient['tenant'] };

/** The store's IANA time zone (stores that never chose one keep the old default, Asia/Kabul) */
export async function getStoreTimeZone(db: Db, tenantId: string): Promise<string> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return storeTimeZoneOf(tenant?.settings);
}

/**
 * An inclusive from/to day filter in the store's calendar. Only the date part (YYYY-MM-DD) of each
 * bound is used, so "to" covers that whole store day.
 */
export function storeDayFilter(tz: string, from?: string, to?: string): { gte?: Date; lte?: Date } {
  return {
    ...(from && { gte: storeDayStartUtc(from.slice(0, 10), tz) }),
    ...(to && { lte: storeDayEndUtc(to.slice(0, 10), tz) }),
  };
}
