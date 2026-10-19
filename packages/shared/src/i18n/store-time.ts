/**
 * Store time zone helpers. Instants are always stored in UTC; a store's IANA time zone decides which
 * calendar day an instant belongs to and how a wall-clock time typed in the store maps to an instant.
 * Uses the runtime's Intl time-zone database, so daylight-saving changes are handled.
 */

/** Stores that never chose a zone keep the behaviour they always had (Kabul time) */
export const DEFAULT_STORE_TIME_ZONE = 'Asia/Kabul';

/** Suggested first in the picker; any valid IANA zone is accepted */
export const COMMON_STORE_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Asia/Kabul',
  'Europe/London',
  'UTC',
] as const;

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function storeTimeZoneOf(settings: unknown): string {
  const tz = (settings as { timeZone?: unknown } | null | undefined)?.timeZone;
  return isValidTimeZone(tz) ? tz : DEFAULT_STORE_TIME_ZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone */
export function zonedParts(instant: Date, tz: string) {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** Offset of the zone at that instant, in minutes (e.g. -240 for New York in summer) */
function offsetMinutes(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which the store's clock shows this wall time. Re-checks the offset once so the
 * result is right on both sides of a daylight-saving change; a time skipped by a spring-forward
 * gap lands just after the gap.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMinutes(new Date(guess), tz);
  let utc = guess - first * 60_000;
  const second = offsetMinutes(new Date(utc), tz);
  if (second !== first) utc = guess - second * 60_000;
  return new Date(utc);
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;
function dayParts(day: string) {
  const m = DAY.exec(day);
  if (!m) throw new Error(`Not a date: ${day}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Calendar day (YYYY-MM-DD) of an instant in the store's zone */
export function storeDateOf(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** First instant of a store calendar day */
export function storeDayStartUtc(day: string, tz: string): Date {
  const { y, m, d } = dayParts(day);
  return zonedTimeToUtc(y, m, d, 0, 0, tz);
}

/** First instant of the following store calendar day (exclusive end of `day`) */
export function storeNextDayStartUtc(day: string, tz: string): Date {
  const { y, m, d } = dayParts(day);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz);
}

/** Last millisecond of a store calendar day — for inclusive "to" filters */
export function storeDayEndUtc(day: string, tz: string): Date {
  return new Date(storeNextDayStartUtc(day, tz).getTime() - 1);
}

export function storeTodayStartUtc(tz: string, now = new Date()): Date {
  return storeDayStartUtc(storeDateOf(now, tz), tz);
}

export function storeMonthStartUtc(tz: string, now = new Date()): Date {
  const p = zonedParts(now, tz);
  return zonedTimeToUtc(p.year, p.month, 1, 0, 0, tz);
}

/**
 * A wall-clock value typed in the store ("2026-11-01T09:30" or "...:00"), read in the store's zone.
 * A value that already carries a zone (Z or ±hh:mm) is an exact instant and is taken as-is.
 */
export function storeWallTimeToUtc(value: string, tz: string): Date {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return new Date(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error(`Not a date-time: ${value}`);
  return zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
}

/** "HH:MM" of an instant on the store's clock */
export function storeClockTime(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
