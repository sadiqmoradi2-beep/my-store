'use client';

import { formatDisplayDate, type Locale } from '@my-store/shared';

/** Gregorian-formatted date */
export function formatDate(value: string | Date, _locale?: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return formatDisplayDate(date, 'GREGORIAN');
}

/** Amount with a thousands separator; input is a string (serialized Decimal) */
export function formatMoney(value: string | number, _locale?: Locale): string {
  const num = Number(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
}

export function formatNumber(value: number, _locale?: Locale): string {
  return String(value);
}

/** Date and time, e.g. 26 September 2026, 09:15 */
export function formatDateTime(value: string | Date, locale?: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(date, locale)}, ${time}`;
}

/** Length of a session, e.g. 2d 3h 5m */
export function formatDuration(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d ? `${d}d` : '', h || d ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}
