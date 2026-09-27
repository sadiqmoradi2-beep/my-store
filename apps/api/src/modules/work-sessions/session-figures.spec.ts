import { Prisma } from '@prisma/client';
import { computeFigures } from './session-figures';

const D = (v: number) => new Prisma.Decimal(v);

/** $queryRaw is called five times per computation: sales, cash flows, harvests, pending count, adjustments */
function dbWith(rows: { sales?: unknown[]; flows?: unknown[]; harvests?: unknown[]; pending?: unknown[]; adjustments?: unknown[] }) {
  const queue = [rows.sales ?? [], rows.flows ?? [], rows.harvests ?? [], rows.pending ?? [], rows.adjustments ?? []];
  return { $queryRaw: jest.fn().mockImplementation(() => Promise.resolve(queue.shift())) };
}

const session = { id: 's1', openingCash: D(500), harvestLimit: D(2000) };

describe('computeFigures', () => {
  it('the example of the specification: 500 + 2000 income - 100 expenses - 1200 harvested = 1200 in the box', async () => {
    const db = dbWith({
      sales: [{ sessionId: 's1', method: 'CASH', total: D(2000), cost: D(1500), n: 5 }],
      flows: [{ sessionId: 's1', part: 'CASH', type: 'EXPENSE', amount: D(100) }],
      harvests: [{ sessionId: 's1', method: 'CASH', amount: D(1200) }],
    });
    const f = (await computeFigures(db as never, 't1', [session])).get('s1')!;
    expect(f.salesTotal.toString()).toBe('2000');
    expect(f.expectedCash.toString()).toBe('1200');
    expect(f.remainingHarvestLimit.toString()).toBe('800');
    expect(f.totalExpenses.toString()).toBe('100');
    expect(f.salesProfit.toString()).toBe('500');
  });

  it('card / EBT / Zelle sales are income but never physical cash', async () => {
    const db = dbWith({
      sales: [
        { sessionId: 's1', method: 'CASH', total: D(100), cost: D(60), n: 1 },
        { sessionId: 's1', method: 'CARD', total: D(300), cost: D(200), n: 2 },
        { sessionId: 's1', method: 'EBT', total: D(50), cost: D(30), n: 1 },
        { sessionId: 's1', method: 'ZELLE', total: D(70), cost: D(40), n: 1 },
      ],
    });
    const f = (await computeFigures(db as never, 't1', [session])).get('s1')!;
    expect(f.salesTotal.toString()).toBe('520');
    expect(f.salesCash.toString()).toBe('100');
    expect(f.salesCount).toBe(5);
    expect(f.expectedCash.toString()).toBe('600'); // 500 + 100 cash only
  });

  it('a non-cash expense is an expense but does not reduce the cash box', async () => {
    const db = dbWith({
      flows: [
        { sessionId: 's1', part: 'CASH', type: 'EXPENSE', amount: D(40) },
        { sessionId: 's1', part: 'ZELLE', type: 'EXPENSE', amount: D(60) },
        { sessionId: 's1', part: 'CASH', type: 'WITHDRAWAL', amount: D(10) },
      ],
    });
    const f = (await computeFigures(db as never, 't1', [session])).get('s1')!;
    expect(f.totalExpenses.toString()).toBe('110');
    expect(f.cashExpenses.toString()).toBe('50');
    expect(f.expectedCash.toString()).toBe('450');
  });

  it('other cash received (a debt collected in cash) adds to the box; other parts do not', async () => {
    const db = dbWith({
      flows: [
        { sessionId: 's1', part: 'CASH', type: 'INCOME', amount: D(75) },
        { sessionId: 's1', part: 'EBT', type: 'INCOME', amount: D(25) },
      ],
    });
    const f = (await computeFigures(db as never, 't1', [session])).get('s1')!;
    expect(f.otherCashReceived.toString()).toBe('75');
    expect(f.expectedCash.toString()).toBe('575');
  });

  it('a harvest is not an expense; a Zelle harvest counts against the limit but does not empty the box', async () => {
    const db = dbWith({
      harvests: [
        { sessionId: 's1', method: 'CASH', amount: D(200) },
        { sessionId: 's1', method: 'ZELLE', amount: D(300) },
      ],
    });
    const f = (await computeFigures(db as never, 't1', [session])).get('s1')!;
    expect(f.totalExpenses.toString()).toBe('0');
    expect(f.harvestedTotal.toString()).toBe('500');
    expect(f.harvestedCash.toString()).toBe('200');
    expect(f.remainingHarvestLimit.toString()).toBe('1500');
    expect(f.expectedCash.toString()).toBe('300');
  });

  it('adjustments correct the box; pending harvests are only counted, not deducted', async () => {
    const db = dbWith({
      pending: [{ sessionId: 's1', n: 2 }],
      adjustments: [{ sessionId: 's1', amount: D(-30) }],
    });
    const f = (await computeFigures(db as never, 't1', [session])).get('s1')!;
    expect(f.adjustments.toString()).toBe('-30');
    expect(f.pendingHarvests).toBe(2);
    expect(f.expectedCash.toString()).toBe('470');
  });

  it('every session gets its own figures; rows of another session are not mixed in', async () => {
    const db = dbWith({
      sales: [
        { sessionId: 's1', method: 'CASH', total: D(100), cost: D(50), n: 1 },
        { sessionId: 's2', method: 'CASH', total: D(900), cost: D(500), n: 3 },
      ],
    });
    const map = await computeFigures(db as never, 't1', [session, { id: 's2', openingCash: D(0), harvestLimit: D(0) }]);
    expect(map.get('s1')!.expectedCash.toString()).toBe('600');
    expect(map.get('s2')!.expectedCash.toString()).toBe('900');
  });

  it('no sessions → no queries', async () => {
    const db = dbWith({});
    expect((await computeFigures(db as never, 't1', [])).size).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
