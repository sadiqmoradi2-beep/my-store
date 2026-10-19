import { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'cashTransaction'>;

export interface EffectiveResult {
  amount: Prisma.Decimal;
  registerId: string;
}

/**
 * What an original transaction amounts to today: its own amount plus the signed correction entries
 * linked to it, per account. Derived from the ledger itself (not the audit), so it stays right after a
 * backup restore or reset. A healthy original nets to a positive amount on exactly one account.
 */
export async function effectiveOf(
  db: Db,
  originals: { id: string; amount: Prisma.Decimal; registerId: string }[],
): Promise<Map<string, EffectiveResult | null>> {
  const result = new Map<string, EffectiveResult | null>();
  if (originals.length === 0) return result;
  const entries = await db.cashTransaction.findMany({
    where: { correctionOfId: { in: originals.map((o) => o.id) } },
    select: { correctionOfId: true, registerId: true, amount: true },
  });
  for (const original of originals) {
    const mine = entries.filter((e) => e.correctionOfId === original.id);
    if (mine.length === 0) continue;
    const net = new Map<string, Prisma.Decimal>([[original.registerId, original.amount]]);
    for (const e of mine) net.set(e.registerId, (net.get(e.registerId) ?? new Prisma.Decimal(0)).add(e.amount));
    const nonZero = [...net.entries()].filter(([, v]) => !v.isZero());
    // anything else (two accounts, or a non-positive net) is not a state corrections can produce
    result.set(
      original.id,
      nonZero.length === 1 && nonZero[0][1].isPositive() ? { registerId: nonZero[0][0], amount: nonZero[0][1] } : null,
    );
  }
  return result;
}
