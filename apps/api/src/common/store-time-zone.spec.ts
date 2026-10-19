import {
  isValidTimeZone,
  storeClockTime,
  storeDateOf,
  storeDayEndUtc,
  storeDayStartUtc,
  storeMonthStartUtc,
  storeNextDayStartUtc,
  storeTimeZoneOf,
  storeWallTimeToUtc,
} from '@my-store/shared';
import { storeDayFilter } from './store-time-zone';

const iso = (d: Date) => d.toISOString();

describe('store time zones', () => {
  it('validates IANA zones; stores without a valid zone keep the old default (Asia/Kabul)', () => {
    for (const tz of ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Kabul', 'UTC']) expect(isValidTimeZone(tz)).toBe(true);
    for (const tz of ['Mars/Base', '', 'EST5EDT; DROP', 42]) expect(isValidTimeZone(tz)).toBe(false);
    expect(storeTimeZoneOf(null)).toBe('Asia/Kabul');
    expect(storeTimeZoneOf({ timeZone: 'Nope/Zone' })).toBe('Asia/Kabul');
    expect(storeTimeZoneOf({ timeZone: 'America/Chicago' })).toBe('America/Chicago');
  });

  it('a wall time typed in the store maps to the right instant, per zone', () => {
    expect(iso(storeWallTimeToUtc('2026-07-01T09:00', 'America/New_York'))).toBe('2026-07-01T13:00:00.000Z'); // EDT -4
    expect(iso(storeWallTimeToUtc('2026-01-15T09:00:00', 'America/New_York'))).toBe('2026-01-15T14:00:00.000Z'); // EST -5
    expect(iso(storeWallTimeToUtc('2026-07-01T09:00', 'America/Chicago'))).toBe('2026-07-01T14:00:00.000Z');
    expect(iso(storeWallTimeToUtc('2026-07-01T09:00', 'America/Los_Angeles'))).toBe('2026-07-01T16:00:00.000Z');
    expect(iso(storeWallTimeToUtc('2026-07-01T09:00', 'Asia/Kabul'))).toBe('2026-07-01T04:30:00.000Z');
    // a value that already carries a zone is an exact instant
    expect(iso(storeWallTimeToUtc('2026-07-01T09:00:00Z', 'America/New_York'))).toBe('2026-07-01T09:00:00.000Z');
  });

  it('DST spring-forward day (New York, 8 Mar 2026) is 23 hours; times on each side are exact', () => {
    const start = storeDayStartUtc('2026-03-08', 'America/New_York');
    const next = storeNextDayStartUtc('2026-03-08', 'America/New_York');
    expect(iso(start)).toBe('2026-03-08T05:00:00.000Z');
    expect((next.getTime() - start.getTime()) / 3_600_000).toBe(23);
    expect(iso(storeWallTimeToUtc('2026-03-08T01:30', 'America/New_York'))).toBe('2026-03-08T06:30:00.000Z');
    expect(iso(storeWallTimeToUtc('2026-03-08T03:30', 'America/New_York'))).toBe('2026-03-08T07:30:00.000Z');
    // an overnight shift 22:00 → 06:00 across the change is 7 real hours
    const a = storeWallTimeToUtc('2026-03-07T22:00', 'America/New_York');
    const b = storeWallTimeToUtc('2026-03-08T06:00', 'America/New_York');
    expect((b.getTime() - a.getTime()) / 3_600_000).toBe(7);
  });

  it('DST fall-back day (New York, 1 Nov 2026) is 25 hours; an overnight shift across it is 9 real hours', () => {
    const start = storeDayStartUtc('2026-11-01', 'America/New_York');
    expect((storeNextDayStartUtc('2026-11-01', 'America/New_York').getTime() - start.getTime()) / 3_600_000).toBe(25);
    const a = storeWallTimeToUtc('2026-10-31T22:00', 'America/New_York');
    const b = storeWallTimeToUtc('2026-11-01T06:00', 'America/New_York');
    expect((b.getTime() - a.getTime()) / 3_600_000).toBe(9);
  });

  it('calendar day, clock time and month start are read in the store zone', () => {
    const lateNightNy = new Date('2026-07-02T03:30:00Z'); // 23:30 on 1 Jul in New York
    expect(storeDateOf(lateNightNy, 'America/New_York')).toBe('2026-07-01');
    expect(storeDateOf(lateNightNy, 'Asia/Kabul')).toBe('2026-07-02');
    expect(storeClockTime(lateNightNy, 'America/New_York')).toBe('23:30');
    expect(iso(storeMonthStartUtc('America/Los_Angeles', new Date('2026-07-15T12:00:00Z')))).toBe('2026-07-01T07:00:00.000Z');
    expect(iso(storeDayEndUtc('2026-07-01', 'UTC'))).toBe('2026-07-01T23:59:59.999Z');
  });

  it('a from/to filter covers whole store days', () => {
    const f = storeDayFilter('America/Chicago', '2026-07-01', '2026-07-31T00:00:00.000Z');
    expect(iso(f.gte!)).toBe('2026-07-01T05:00:00.000Z');
    expect(iso(f.lte!)).toBe('2026-08-01T04:59:59.999Z');
    expect(storeDayFilter('UTC')).toEqual({});
  });
});
