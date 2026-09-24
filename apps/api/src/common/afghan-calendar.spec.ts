import {
  AFGHAN_MONTHS,
  dateToJalaliKabul,
  formatDisplayDate,
  formatJalali,
  gregorianToJalali,
  jalaliToGregorian,
} from '@my-store/shared';

describe('Afghan Solar Hijri calendar', () => {
  it('18 July 2026 = 27 Saratan 1405 (not the Iranian Tir)', () => {
    const { jy, jm, jd } = gregorianToJalali(2026, 7, 18);
    expect({ jy, jm, jd }).toEqual({ jy: 1405, jm: 4, jd: 27 });
    expect(AFGHAN_MONTHS[jm - 1]).toBe('Saratan');
  });

  it('Nowruz: 21 March 2026 = 1 Hamal 1405', () => {
    expect(gregorianToJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 });
  });

  it('reverse conversion preserves round-trip integrity', () => {
    for (const [gy, gm, gd] of [[2026, 7, 18], [2025, 3, 20], [2024, 2, 29], [2026, 12, 31]]) {
      const j = gregorianToJalali(gy, gm, gd);
      expect(jalaliToGregorian(j.jy, j.jm, j.jd)).toEqual({ gy, gm, gd });
    }
  });

  it('respects the Kabul midnight boundary (UTC+4:30)', () => {
    // 19:29 UTC = 23:59 Kabul (same day) — 19:31 UTC = 00:01 Kabul (next day)
    const before = dateToJalaliKabul(new Date(Date.UTC(2026, 6, 18, 19, 29)));
    const after = dateToJalaliKabul(new Date(Date.UTC(2026, 6, 18, 19, 31)));
    expect(before.jd).toBe(27);
    expect(after.jd).toBe(28);
  });

  it('formatJalali uses the Afghan month name, not the Iranian one', () => {
    expect(formatJalali(new Date(Date.UTC(2026, 6, 18, 12)))).toBe('27 Saratan 1405');
  });

  it('formatDisplayDate picks Gregorian or Solar Hijri by the calendar argument alone', () => {
    const jan = new Date(Date.UTC(2026, 0, 15, 12));
    expect(formatDisplayDate(jan, 'GREGORIAN')).toBe('15 January 2026');
    expect(formatDisplayDate(jan, 'SOLAR_HIJRI')).not.toBe(formatDisplayDate(jan, 'GREGORIAN'));
  });
});
