import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { minutesBetween, payFor, storeRange, WorkIntervalsService } from './work-intervals.service';

describe('hourly payroll helpers', () => {
  it('a store day range is [day start, day after end) in UTC, per zone and across DST', () => {
    const kabul = storeRange({ from: '2026-09-01', to: '2026-09-01' }, 'Asia/Kabul');
    expect(kabul.start.toISOString()).toBe('2026-08-31T19:30:00.000Z');
    expect(kabul.end.toISOString()).toBe('2026-09-01T19:30:00.000Z');
    // New York falls back on 1 Nov 2026: that day is 25 hours long
    const ny = storeRange({ from: '2026-11-01', to: '2026-11-01' }, 'America/New_York');
    expect(ny.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(ny.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(() => storeRange({ from: '2026-09-02', to: '2026-09-01' }, 'UTC')).toThrow('"to"');
  });

  it('minutes need a real end after the start — never estimated', () => {
    const a = new Date('2026-09-01T09:00:00Z');
    expect(minutesBetween(a, new Date('2026-09-01T17:30:59Z'))).toBe(510);
    expect(minutesBetween(a, null)).toBeNull();
    expect(minutesBetween(a, new Date('2026-09-01T08:00:00Z'))).toBeNull();
  });

  it('pay = minutes / 60 × rate, rounded once to cents', () => {
    expect(payFor(870, '12.50').toString()).toBe('181.25');
    expect(payFor(1, '10').toString()).toBe('0.17');
  });
});

describe('WorkIntervalsService.pay', () => {
  it('refuses when any previewed stretch is no longer approved & unpaid (nothing is booked)', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      employeeWorkInterval: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', approvedMinutes: 60, hourlyRate: new Prisma.Decimal(10) }]) },
      salaryPayment: { create: jest.fn() },
    };
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'e1', payType: 'HOURLY', fullName: 'E', hourlyRate: new Prisma.Decimal(10) }) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ settings: null }) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', fullName: 'Admin' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    const service = new WorkIntervalsService(prisma as never);
    await expect(
      service.pay('t1', 'u1', 'e1', { from: '2026-09-01', to: '2026-09-30', intervalIds: ['i1', 'i2'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
  });
});
