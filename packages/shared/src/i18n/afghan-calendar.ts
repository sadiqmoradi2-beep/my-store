/**
 * Afghan Solar Hijri (Jalali) calendar + Gregorian calendar.
 * The Afghan Solar Hijri month names (Hamal…Hut) differ from the Iranian
 * ones (Farvardin…Esfand) — never substitute a generic Jalali library's
 * month names here.
 */

export const AFGHAN_MONTHS: string[] = [
  'Hamal',
  'Sawr',
  'Jawza',
  'Saratan',
  'Asad',
  'Sonbola',
  'Mizan',
  'Aqrab',
  'Qaws',
  'Jadi',
  'Dalw',
  'Hut',
];

export const GREGORIAN_MONTHS: string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const KABUL_UTC_OFFSET_MINUTES = 4 * 60 + 30;

/** Kept for backward compatibility; the platform is English-only, so this is now a no-op. */
export function toPersianDigits(value: string | number): string {
  return String(value);
}

export interface JalaliDate {
  jy: number;
  jm: number; // 1..12
  jd: number;
}

/** Standard jalaali conversion algorithm — no external dependency. */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

/** Date parts in the Kabul timezone (UTC+4:30). */
function kabulParts(date: Date): { y: number; m: number; d: number } {
  const kabul = new Date(date.getTime() + KABUL_UTC_OFFSET_MINUTES * 60_000);
  return { y: kabul.getUTCFullYear(), m: kabul.getUTCMonth() + 1, d: kabul.getUTCDate() };
}

export function dateToJalaliKabul(date: Date): JalaliDate {
  const { y, m, d } = kabulParts(date);
  return gregorianToJalali(y, m, d);
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  jy += 1595;
  let days =
    -355668 +
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const monthDays = [
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm - 1]) {
    gd -= monthDays[gm - 1];
    gm++;
  }
  return { gy, gm, gd };
}

/** Start of the current Kabul day, in UTC. */
export function kabulDayStartUtc(now = new Date()): Date {
  const offsetMs = KABUL_UTC_OFFSET_MINUTES * 60_000;
  const kabul = new Date(now.getTime() + offsetMs);
  return new Date(
    Date.UTC(kabul.getUTCFullYear(), kabul.getUTCMonth(), kabul.getUTCDate()) - offsetMs,
  );
}

/** Start of the current Solar Hijri month (Kabul time), in UTC. */
export function kabulJalaliMonthStartUtc(now = new Date()): Date {
  const { jy, jm } = dateToJalaliKabul(now);
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, 1);
  const offsetMs = KABUL_UTC_OFFSET_MINUTES * 60_000;
  return new Date(Date.UTC(gy, gm - 1, gd) - offsetMs);
}

/** Start of the current Gregorian month (Kabul time), in UTC — the dashboard's "sales month" boundary. */
export function kabulGregorianMonthStartUtc(now = new Date()): Date {
  const { y, m } = kabulParts(now);
  const offsetMs = KABUL_UTC_OFFSET_MINUTES * 60_000;
  return new Date(Date.UTC(y, m - 1, 1) - offsetMs);
}

/** Afghan Solar Hijri date, e.g. "27 Saratan 1405". */
export function formatJalali(date: Date): string {
  const { jy, jm, jd } = dateToJalaliKabul(date);
  const month = AFGHAN_MONTHS[jm - 1];
  return `${jd} ${month} ${jy}`;
}

/** Gregorian date with month name, e.g. "15 January 2026". */
export function formatGregorian(date: Date): string {
  const { y, m, d } = kabulParts(date);
  const month = GREGORIAN_MONTHS[m - 1];
  return `${d} ${month} ${y}`;
}

export type DisplayCalendar = 'SOLAR_HIJRI' | 'GREGORIAN';

/** Final display date, per the user's calendar preference: Solar Hijri (Hamal…) or Gregorian (January…). */
export function formatDisplayDate(date: Date, calendar: DisplayCalendar): string {
  return calendar === 'SOLAR_HIJRI' ? formatJalali(date) : formatGregorian(date);
}
