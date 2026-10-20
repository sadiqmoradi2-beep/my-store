/* Exercise the additive migration with populated historical data, in a rolled-back transaction on a disposable DB only. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55439'); assert.equal(url.pathname, '/financial_security');
const db = new PrismaClient({ datasourceUrl: url.toString() });
const tables = ['CashRegister', 'CashTransaction', 'TeamPerson', 'User', 'SalaryPayment', 'SellerSalaryPayment', 'PartnerLedgerEntry', 'CashTransactionEdit'];
const rollback = new Error('Rollback isolated migration rehearsal');
async function fingerprints(client, legacy = false) {
  const result = {};
  for (const table of tables) {
    const row = legacy && table === 'CashTransaction' ? "(to_jsonb(t) - 'staffActorPersonId' - 'staffActorName' - 'destination')" : 'to_jsonb(t)';
    result[table] = await client.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(coalesce(string_agg(${row}::text, ',' ORDER BY id), '')) AS fingerprint FROM "${table}" t`);
  }
  return result;
}
(async () => {
  assert.ok(await db.cashTransaction.count() > 0, 'Run financial-personnel.integration.cjs first');
  const original = await fingerprints(db);
  try {
    await db.$transaction(async (tx) => {
      const before = await fingerprints(tx, true);
      await tx.$executeRawUnsafe('ALTER TABLE "CashTransaction" DROP COLUMN "staffActorPersonId", DROP COLUMN "staffActorName", DROP COLUMN "destination"');
      const sql = readFileSync(join(__dirname, '../prisma/migrations/20261025000000_financial_actor/migration.sql'), 'utf8');
      for (const statement of sql.replace(/--[^\n]*/g, '').split(';').filter((s) => s.trim())) await tx.$executeRawUnsafe(statement);
      assert.deepEqual(await fingerprints(tx, true), before, 'Historical monetary, personnel, login and audit data must be identical after migration');
      assert.equal(await tx.cashTransaction.count({ where: { OR: [{ staffActorPersonId: { not: null } }, { staffActorName: { not: null } }, { destination: { not: null } }] } }), 0, 'Historical attribution must remain unknown, never invented');
      throw rollback;
    }, { timeout: 30000 });
  } catch (e) { if (e !== rollback) throw e; }
  assert.deepEqual(await fingerprints(db), original, 'Rehearsal must roll back completely');
  console.log(`PASS: migration rehearsal preserved row counts and full historical fingerprints across ${tables.length} populated tables, including balances, payroll and audit history; rehearsal fully rolled back.`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
