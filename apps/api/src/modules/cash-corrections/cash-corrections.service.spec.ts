import { Prisma } from '@prisma/client';
import { blockedReasonOf, businessDate, deadlineOf, ledgerStateOf } from './cash-corrections.service';

const D = (v: number) => new Prisma.Decimal(v);
const base = {
  id: 'tx1',
  type: 'EXPENSE',
  amount: D(10),
  referenceType: null,
  correctionOfId: null,
  session: null,
} as never;

describe('cash corrections — rules', () => {
  it('only manual Income / Expense / Withdrawal can be corrected; linked rows, sales, entries and closed sessions are refused', () => {
    expect(blockedReasonOf(base)).toBeNull();
    expect(blockedReasonOf({ ...(base as object), type: 'WITHDRAWAL' } as never)).toBeNull();
    expect(blockedReasonOf({ ...(base as object), referenceType: 'salary' } as never)).toMatch(/salary/);
    expect(blockedReasonOf({ ...(base as object), referenceType: 'debt' } as never)).toMatch(/debt/);
    expect(blockedReasonOf({ ...(base as object), type: 'SALE' } as never)).toMatch(/sale/i);
    expect(blockedReasonOf({ ...(base as object), type: 'REFUND' } as never)).toMatch(/refund/i);
    expect(blockedReasonOf({ ...(base as object), correctionOfId: 'x', referenceType: 'correction' } as never)).toMatch(/correction entry/);
    expect(blockedReasonOf({ ...(base as object), session: { status: 'CLOSED' } } as never)).toMatch(/closed/);
    expect(blockedReasonOf({ ...(base as object), session: { status: 'ACTIVE' } } as never)).toBeNull();
  });

  it('the deadline runs from the immutable recording time; DISABLED or unknown recording time → no window', () => {
    const recordedAt = new Date('2026-10-20T10:00:00Z');
    expect(deadlineOf(recordedAt, null)).toBeNull(); // default = DISABLED
    expect(deadlineOf(recordedAt, { transactionEditingWindow: 'DISABLED' })).toBeNull();
    expect(deadlineOf(recordedAt, { transactionEditingWindow: 'bogus' })).toBeNull();
    expect(deadlineOf(null, { transactionEditingWindow: '1y' })).toBeNull();
    expect(deadlineOf(recordedAt, { transactionEditingWindow: '1h' })!.toISOString()).toBe('2026-10-20T11:00:00.000Z');
    expect(deadlineOf(recordedAt, { transactionEditingWindow: '24h' })!.toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });

  it('a new business date keeps the store clock time, and never lands in the future', () => {
    const original = new Date('2026-10-20T14:30:00Z'); // 10:30 in New York
    const now = new Date('2026-10-20T16:00:00Z');
    expect(businessDate('2026-10-01', original, 'America/New_York', now).toISOString()).toBe('2026-10-01T14:30:00.000Z');
    expect(() => businessDate('2026-10-21', original, 'America/New_York', now)).toThrow(/future/);
    const late = new Date('2026-10-20T23:00:00Z'); // 19:00 NY — later than "now" today
    expect(businessDate('2026-10-20', late, 'America/New_York', now).getTime()).toBeLessThan(now.getTime());
  });

  it('ledger state: a later restore of an older backup undoes a correction; a newer backup keeps it; a reset removes it', () => {
    const at = new Date('2026-10-20T10:00:00Z');
    expect(ledgerStateOf(at, [])).toBe('ACTIVE');
    expect(ledgerStateOf(at, [{ kind: 'RESTORE', createdAt: new Date('2026-10-20T09:00:00Z'), backupCreatedAt: new Date('2026-10-19') }])).toBe('ACTIVE');
    expect(ledgerStateOf(at, [{ kind: 'RESTORE', createdAt: new Date('2026-10-20T12:00:00Z'), backupCreatedAt: new Date('2026-10-20T08:00:00Z') }])).toBe('UNDONE_BY_RESTORE');
    expect(ledgerStateOf(at, [{ kind: 'RESTORE', createdAt: new Date('2026-10-20T12:00:00Z'), backupCreatedAt: new Date('2026-10-20T11:00:00Z') }])).toBe('ACTIVE');
    expect(ledgerStateOf(at, [{ kind: 'RESET', createdAt: new Date('2026-10-20T12:00:00Z'), backupCreatedAt: null }])).toBe('REMOVED_BY_RESET');
  });
});
