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
