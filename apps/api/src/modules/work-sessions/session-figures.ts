import { Prisma } from '@prisma/client';
import { expectedSessionCash } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

const zero = () => new Prisma.Decimal(0);

export interface SessionFigures {
  salesTotal: Prisma.Decimal;
  salesCash: Prisma.Decimal;
  salesProfit: Prisma.Decimal;
  salesCount: number;
  otherCashReceived: Prisma.Decimal;
  cashExpenses: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  harvestedTotal: Prisma.Decimal;
  harvestedCash: Prisma.Decimal;
  pendingHarvests: number;
  adjustments: Prisma.Decimal;
  expectedCash: Prisma.Decimal;
  remainingHarvestLimit: Prisma.Decimal;
}

interface SessionBasics {
  id: string;
  openingCash: Prisma.Decimal;
  harvestLimit: Prisma.Decimal;
}

interface SaleRow {
  sessionId: string;
  method: string;
  total: Prisma.Decimal;
  cost: Prisma.Decimal;
  n: number;
}
interface FlowRow {
  sessionId: string;
  part: string;
  type: string;
  amount: Prisma.Decimal;
}
interface HarvestRow {
  sessionId: string;
  method: string;
  amount: Prisma.Decimal;
}
interface SumRow {
  sessionId: string;
  amount: Prisma.Decimal;
}

const CASH_OUT_TYPES = ['EXPENSE', 'WITHDRAWAL', 'REFUND'];

/**
 * All figures of the given sessions, computed from the transactions that carry the session's id
 * and happened inside its window: from the start until it was closed (or now, while it is active).
 *
 * Income, cash received, expenses, harvests and adjustments are kept apart: only cash moves the cash box —
 * a card / EBT / Zelle sale is income but never physical cash, and a harvest removes cash without being an expense.
 */
export async function computeFigures(
  db: Db,
  tenantId: string,
  sessions: SessionBasics[],
): Promise<Map<string, SessionFigures>> {
  const result = new Map<string, SessionFigures>();
  if (sessions.length === 0) return result;
  const ids = Prisma.join(sessions.map((s) => s.id));

  const [sales, flows, harvests, pending, adjustments] = await Promise.all([
    db.$queryRaw<SaleRow[]>`
      SELECT s."sessionId" AS "sessionId", s."paymentMethod"::text AS method,
             COALESCE(SUM(s.total), 0) AS total, COALESCE(SUM(s.cost), 0) AS cost, COUNT(*)::int AS n
      FROM "Sale" s
      JOIN "WorkSession" w ON w.id = s."sessionId"
      WHERE s."tenantId" = ${tenantId} AND s."sessionId" IN (${ids})
        AND s."createdAt" >= w."startedAt" AND s."createdAt" <= COALESCE(w."closedAt", now())
      GROUP BY s."sessionId", s."paymentMethod"`,
    db.$queryRaw<FlowRow[]>`
      SELECT t."sessionId" AS "sessionId", r.part::text AS part, t.type::text AS type,
             COALESCE(SUM(t.amount), 0) AS amount
      FROM "CashTransaction" t
      JOIN "CashRegister" r ON r.id = t."registerId"
      JOIN "WorkSession" w ON w.id = t."sessionId"
      WHERE t."tenantId" = ${tenantId} AND t."sessionId" IN (${ids}) AND t.type::text <> 'SALE'
        AND t."createdAt" >= w."startedAt" AND t."createdAt" <= COALESCE(w."closedAt", now())
      GROUP BY t."sessionId", r.part, t.type`,
    db.$queryRaw<HarvestRow[]>`
      SELECT h."sessionId" AS "sessionId", h.method::text AS method, COALESCE(SUM(h.amount), 0) AS amount
      FROM "CashHarvest" h
      JOIN "WorkSession" w ON w.id = h."sessionId"
      WHERE h."tenantId" = ${tenantId} AND h."sessionId" IN (${ids}) AND h.status = 'APPROVED'
        AND h."harvestedAt" >= w."startedAt" AND h."harvestedAt" <= COALESCE(w."closedAt", now())
      GROUP BY h."sessionId", h.method`,
    db.$queryRaw<{ sessionId: string; n: number }[]>`
      SELECT h."sessionId" AS "sessionId", COUNT(*)::int AS n
      FROM "CashHarvest" h
      WHERE h."tenantId" = ${tenantId} AND h."sessionId" IN (${ids}) AND h.status = 'PENDING'
      GROUP BY h."sessionId"`,
    db.$queryRaw<SumRow[]>`
      SELECT a."sessionId" AS "sessionId", COALESCE(SUM(a.amount), 0) AS amount
      FROM "SessionAdjustment" a
      WHERE a."tenantId" = ${tenantId} AND a."sessionId" IN (${ids})
      GROUP BY a."sessionId"`,
  ]);

  for (const session of sessions) {
    let salesTotal = zero();
    let salesCash = zero();
    let salesCost = zero();
    let salesCount = 0;
    for (const row of sales.filter((r) => r.sessionId === session.id)) {
      salesTotal = salesTotal.add(row.total);
      salesCost = salesCost.add(row.cost);
      salesCount += row.n;
      if (row.method === 'CASH') salesCash = salesCash.add(row.total);
    }

    let otherCashReceived = zero();
    let cashExpenses = zero();
    let totalExpenses = zero();
    for (const row of flows.filter((r) => r.sessionId === session.id)) {
      if (row.type === 'INCOME' && row.part === 'CASH') otherCashReceived = otherCashReceived.add(row.amount);
      if (CASH_OUT_TYPES.includes(row.type)) {
        totalExpenses = totalExpenses.add(row.amount);
        if (row.part === 'CASH') cashExpenses = cashExpenses.add(row.amount);
      }
    }

    let harvestedTotal = zero();
    let harvestedCash = zero();
    for (const row of harvests.filter((r) => r.sessionId === session.id)) {
      harvestedTotal = harvestedTotal.add(row.amount);
      if (row.method === 'CASH') harvestedCash = harvestedCash.add(row.amount);
    }
    const adjustmentTotal = adjustments.find((r) => r.sessionId === session.id)?.amount ?? zero();

    const expectedCash = new Prisma.Decimal(
      expectedSessionCash({
        openingCash: session.openingCash.toNumber(),
        cashSales: salesCash.toNumber(),
        otherCashReceived: otherCashReceived.toNumber(),
        adjustments: adjustmentTotal.toNumber(),
        cashExpenses: cashExpenses.toNumber(),
        cashHarvested: harvestedCash.toNumber(),
      }),
    ).toDecimalPlaces(2);

    result.set(session.id, {
      salesTotal,
      salesCash,
      salesProfit: salesTotal.sub(salesCost),
      salesCount,
      otherCashReceived,
      cashExpenses,
      totalExpenses,
      harvestedTotal,
      harvestedCash,
      pendingHarvests: pending.find((r) => r.sessionId === session.id)?.n ?? 0,
      adjustments: adjustmentTotal,
      expectedCash,
      remainingHarvestLimit: session.harvestLimit.sub(harvestedTotal),
    });
  }
  return result;
}
