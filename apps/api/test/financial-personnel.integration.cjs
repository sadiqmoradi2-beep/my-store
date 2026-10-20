/* Real PostgreSQL + HTTP controllers. Authentication uses opaque fixture tokens; production auth has its own unit suite.
 * Run after prisma migrate deploy and npm run build -w apps/api. Refuses every database except this disposable local one.
 */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const load = (p) => require(`../dist/src/${p}`);
const { PrismaService } = load('prisma/prisma.service');
const { CashController } = load('modules/cash/cash.controller');
const { CashService } = load('modules/cash/cash.service');
const { CashTransfersController } = load('modules/cash-transfers/cash-transfers.controller');
const { CashTransfersService } = load('modules/cash-transfers/cash-transfers.service');
const { TeamPeopleController } = load('modules/team-people/team-people.controller');
const { TeamPeopleService } = load('modules/team-people/team-people.service');
const { TeamPersonAccountService } = load('modules/team-people/team-person-account.service');
const { AuthService } = load('modules/auth/auth.service');
const { FinancialAccessService } = load('common/financial-access.service');
const { RolePermissionsCacheService } = load('common/role-permissions-cache.service');
const { PermissionsGuard } = load('common/guards/permissions.guard');
const { EmployeesController } = load('modules/employees/employees.controller');
const { EmployeesService } = load('modules/employees/employees.service');
const { SellersController } = load('modules/sellers/sellers.controller');
const { SellersService } = load('modules/sellers/sellers.service');
const { PartnersController } = load('modules/partners/partners.controller');
const { PartnersService } = load('modules/partners/partners.service');
const { UsersService } = load('modules/users/users.service');
const { WorkSessionsService } = load('modules/work-sessions/work-sessions.service');
const { WorkIntervalsService } = load('modules/employees/work-intervals.service');
const { CashCorrectionsController } = load('modules/cash-corrections/cash-corrections.controller');
const { CashCorrectionsService } = load('modules/cash-corrections/cash-corrections.service');

const url = new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55439'); assert.equal(url.pathname, '/financial_security');
const db = new PrismaClient({ datasourceUrl: url.toString() });
const tokens = new Map();
const runId = randomUUID();
let app, base, checks = 0;
async function request(user, path, body, expected = 201, method = 'POST') {
  const token = randomUUID(); tokens.set(token, { userId: user.id, tenantId: user.tenantId, roleId: user.roleId, roleKey: user.role.key });
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  tokens.delete(token);
  const data = await response.json();
  if (Array.isArray(expected)) assert.ok(expected.includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  else assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
async function main() {
  const t = await db.tenant.create({ data: { name: 'Isolated security test', slug: `security-${runId}` } });
  const other = await db.tenant.create({ data: { name: 'Other test store', slug: `other-${runId}` } });
  const b = await db.branch.create({ data: { tenantId: t.id, name: 'Test branch', code: 'A' } });
  const b2 = await db.branch.create({ data: { tenantId: t.id, name: 'Second branch', code: 'B' } });
  const foreignBranch = await db.branch.create({ data: { tenantId: other.id, name: 'Foreign', code: 'A' } });
  const keys = ['cash.read', 'cash.transact', 'cash.manage', 'cash.income.create', 'cash.expense.create', 'cash.withdrawal.create', 'cash.transfer.create', 'employees.read', 'employees.manage', 'sellers.manage', 'partners.manage'];
  for (const key of keys) await db.permission.upsert({ where: { key }, create: { key, moduleKey: key.split('.')[0] }, update: {} });
  async function role(key, permissions, system = false) {
    return db.role.create({ data: { key, name: key, isSystem: system, tenantId: system ? null : t.id,
      rolePermissions: { create: permissions.map((key) => ({ permission: { connect: { key } } })) } } });
  }
  const adminRole = await role('ADMIN', keys, true);
  const cashierRole = await role('CASHIER', ['cash.read', 'cash.transact'], true);
  const managerRole = await role('BRANCH_MANAGER', ['cash.read', 'cash.transact', 'cash.manage'], true);
  const fakeRole = await role('ADMIN', keys);
  async function user(name, r, tenant = t, branch = b) {
    return db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, email: `${name}-${runId}@example.test`, fullName: name,
      passwordHash: 'unusable-test-password', roleId: r.id }, include: { role: true } });
  }
  const admin = await user('admin', adminRole), cashier = await user('cashier', cashierRole), manager = await user('manager', managerRole), fake = await user('custom-admin', fakeRole);
  const peer = await user('cashier-peer', cashierRole);
  const fp = await db.teamPerson.create({ data: { tenantId: t.id, displayName: 'Financial operator' } });
  const fpRole = await role(`FP_${fp.id}`, ['cash.read', 'cash.income.create', 'cash.expense.create', 'cash.withdrawal.create', 'cash.transfer.create']);
  const financial = await user('financial', fpRole);
  await db.teamPerson.update({ where: { id: fp.id }, data: { userId: financial.id } });
  const actor = await db.teamPerson.create({ data: { tenantId: t.id, displayName: 'Admin-selected actor' } });
  const foreignActor = await db.teamPerson.create({ data: { tenantId: other.id, displayName: 'Foreign actor' } });
  const recipient = await db.partner.create({ data: { tenantId: t.id, name: 'Recipient partner' } });
  const recipientUser = await user('salary-recipient', cashierRole);
  const employee = await db.employee.create({ data: { tenantId: t.id, userId: recipientUser.id, fullName: 'Employee recipient', position: 'Staff', salary: 100 } });
  const seller = await db.sellerProfile.create({ data: { tenantId: t.id, userId: recipientUser.id, payType: 'COMMISSION', commissionPercent: 10 } });
  const register = (branch, part) => db.cashRegister.create({ data: { tenantId: branch.tenantId, branchId: branch.id, part, name: `${part} test`, balance: 1000, openingBalance: 1000 } });
  const cash = await register(b, 'CASH'), zelle = await register(b, 'ZELLE'), wrongBranch = await register(b2, 'CASH'), foreignAccount = await register(foreignBranch, 'CASH');
  const moduleRef = await Test.createTestingModule({
    controllers: [CashController, CashTransfersController, TeamPeopleController, EmployeesController, SellersController, PartnersController, CashCorrectionsController],
    providers: [CashService, CashTransfersService, TeamPeopleService, TeamPersonAccountService, FinancialAccessService, RolePermissionsCacheService,
      EmployeesService, SellersService, PartnersService, CashCorrectionsService,
      { provide: UsersService, useValue: {} }, { provide: WorkSessionsService, useValue: {} },
      { provide: PrismaService, useValue: db }, { provide: AuthService, useValue: { sendAccountInvite: async () => {} } }],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.use((req, res, next) => { req.user = tokens.get((req.headers.authorization || '').replace('Bearer ', '')); if (!req.user) return res.status(401).json({ message: 'Fixture authentication required' }); next(); });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalGuards(new PermissionsGuard(app.get(Reflector), db, app.get(RolePermissionsCacheService)));
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  const txPath = `/cash-registers/${cash.id}/transactions`;
  const money = (type = 'EXPENSE', extra = {}) => ({ type, amount: 10, sessionId: null, ...extra });
  const selection = (id, type = 'EXPENSE') => ({ personnel: { operation: type === 'INCOME' ? 'RECEIVE' : 'PAYMENT', personId: id } });
  const balances = async () => (await db.cashRegister.findMany({ where: { tenantId: t.id }, orderBy: { id: 'asc' } })).map((r) => [r.id, r.balance.toString()]);
  const fingerprint = async () => JSON.stringify({ balances: await balances(), transactions: await db.cashTransaction.count({ where: { tenantId: t.id } }), transfers: await db.cashTransfer.count({ where: { tenantId: t.id } }) });

  for (const type of ['INCOME', 'EXPENSE', 'WITHDRAWAL']) {
    const created = await request(admin, txPath, money(type, { ...selection(actor.id, type), ...(type === 'INCOME' ? { paidBy: { kind: 'PARTNER', id: recipient.id } } : { receivedBy: { kind: 'PARTNER', id: recipient.id }, destination: 'Recipient bank' }) }));
    assert.equal(created.performedById, admin.id); assert.equal(created.staffActorPersonId, actor.id);
    assert.equal(created[type === 'INCOME' ? 'paidByPartnerId' : 'receivedByPartnerId'], recipient.id);
    const own = await request(financial, txPath, money(type)); assert.equal(own.staffActorPersonId, fp.id); assert.equal(own.performedById, financial.id);
    const before = await fingerprint();
    for (const operator of [financial, cashier, manager, fake]) {
      await request(operator, txPath, money(type, selection(actor.id, type)), 403);
      await request(operator, txPath, money(type, { [type === 'INCOME' ? 'receivedBy' : 'paidBy']: { kind: 'PERSON', id: actor.id } }), 403);
    }
    assert.equal(await fingerprint(), before, 'Rejected actors must never move money');
  }
  for (const operator of [cashier, manager]) {
    const created = await request(operator, txPath, money()); assert.equal(created.performedById, operator.id); assert.equal(created.staffActorPersonId, null); assert.equal(created.paidByName, null);
  }
  for (const invalidId of [recipient.id, foreignActor.id, 'missing-person']) await request(admin, txPath, money('EXPENSE', selection(invalidId)), 403);
  await request(admin, txPath, money('EXPENSE', selection(employee.id)), 403);
  await request(admin, txPath, money('EXPENSE', { paidBy: { kind: 'PARTNER', id: recipient.id } }), 400);
  await request(financial, txPath, money('EXPENSE', { roleKey: 'ADMIN' }), 400);
  await request(financial, txPath, money('EXPENSE', { receivedBy: { kind: 'ADMIN', id: actor.id } }), 400);
  await request(financial, `/cash-registers/${wrongBranch.id}/transactions`, money(), 403);
  await request(financial, `/cash-registers/${foreignAccount.id}/transactions`, money(), 404);
  const context = await request(financial, '/team-people/actor-context', undefined, 200, 'GET'); assert.equal(context.canSelectActor, false); assert.equal(context.actor.id, fp.id);
  assert.equal((await request(fake, '/team-people/actor-context', undefined, 200, 'GET')).canSelectActor, false);

  // Salary, commission and partner workflows keep their own real recipient and exactly one cash effect.
  for (const path of [`/employees/${employee.id}/salary-payments`, `/sellers/${seller.id}/salary-payments`, `/partners/${recipient.id}/entries`]) {
    const input = { amount: 12, period: '2026-10', registerId: cash.id, sessionId: null, paidByPersonId: actor.id, destination: 'Recipient account',
      ...(path.includes('/partners/') && { type: 'WITHDRAWAL' }) };
    const before = await db.cashTransaction.count();
    await request(admin, path, input);
    assert.equal(await db.cashTransaction.count(), before + 1);
    const recorded = await db.cashTransaction.findFirst({ where: { tenantId: t.id, staffActorPersonId: actor.id, destination: 'Recipient account' }, orderBy: { recordedAt: 'desc' } });
    assert.equal(recorded.performedById, admin.id);
    if (path.includes('/employees/')) assert.equal(recorded.receivedByEmployeeId, employee.id);
    if (path.includes('/partners/')) assert.equal(recorded.receivedByPartnerId, recipient.id);
    const paymentCounts = async () => JSON.stringify([await db.salaryPayment.count(), await db.sellerSalaryPayment.count(), await db.partnerLedgerEntry.count()]);
    const validCounts = await paymentCounts();
    await request(financial, path, input, 403);
    // A custom role with payment permission still cannot impersonate staff.
    await request(fake, path, input, 403);
    assert.equal(await db.cashTransaction.count(), before + 1);
    assert.equal(await paymentCounts(), validCounts, 'Rejected attribution must roll back the linked payment too');
  }
  const hourly = await db.employee.create({ data: { tenantId: t.id, fullName: 'Hourly recipient', position: 'Hourly', salary: 0, payType: 'HOURLY', hourlyRate: 10 } });
  const attendance = await db.employeeAttendance.create({ data: { tenantId: t.id, employeeId: hourly.id, date: new Date('2026-10-19T00:00:00Z'), status: 'PRESENT', recordedById: admin.id } });
  const interval = await db.employeeWorkInterval.create({ data: { tenantId: t.id, employeeId: hourly.id, attendanceId: attendance.id, startAt: new Date('2026-10-19T10:00:00Z'), endAt: new Date('2026-10-19T11:00:00Z'), recordedMinutes: 60, approvedMinutes: 60, hourlyRate: 10, status: 'APPROVED' } });
  const hourlyBefore = await db.cashTransaction.count();
  await new WorkIntervalsService(db).pay(t.id, admin.id, hourly.id, { from: '2026-10-19', to: '2026-10-19', intervalIds: [interval.id], registerId: cash.id, sessionId: null });
  assert.equal(await db.cashTransaction.count(), hourlyBefore + 1); checks++;

  const newAccountEmail = `new-fp-${runId}@example.test`;
  await request(fake, '/team-people', { displayName: 'Forged account', account: { email: newAccountEmail, branchId: b.id } }, 403);
  await request(admin, '/team-people', { displayName: 'Privileged account', account: { email: newAccountEmail, branchId: b.id, capabilities: ['users.manage'] } }, 400);
  const added = await request(admin, '/team-people', { displayName: 'New onboarded operator', account: { email: newAccountEmail, branchId: b.id, capabilities: ['cash.income.create'] } });
  const onboarded = await db.user.findUnique({ where: { email: newAccountEmail }, include: { role: true } });
  assert.match(onboarded.passwordHash, /^\$2[aby]\$/); assert.equal(added.hasAccount, true);
  assert.equal((await db.teamPerson.findUnique({ where: { userId: onboarded.id } })).id, added.id);
  assert.equal(onboarded.role.key, `FP_${added.id}`);
  await request(onboarded, txPath, money('EXPENSE'), 403);
  await request(onboarded, txPath, money('INCOME'));
  await Promise.all([
    request(admin, `/team-people/${added.id}/account`, { loginEnabled: true }, [200, 422], 'PATCH'),
    request(admin, `/team-people/${added.id}`, undefined, 200, 'DELETE'),
  ]);
  assert.equal((await db.user.findUnique({ where: { id: onboarded.id } })).status, 'INACTIVE');
  assert.equal(await db.rolePermission.count({ where: { roleId: onboarded.roleId } }), 0);
  await request(admin, `/team-people/${added.id}/account`, { loginEnabled: true }, 422, 'PATCH');
  const unused = await request(admin, '/team-people', { displayName: 'Unused unlinked person' });
  assert.equal((await request(admin, `/team-people/${unused.id}`, undefined, 200, 'DELETE')).result, 'DELETED');

  const concurrentUser = await user('concurrent-link', cashierRole);
  const linkTargets = await Promise.all(['A', 'B'].map((suffix) => db.teamPerson.create({ data: { tenantId: t.id, displayName: `Concurrent link ${suffix}` } })));
  await Promise.all(linkTargets.map((target) => request(admin, `/team-people/${target.id}/account/link`, { email: concurrentUser.email }, [201, 409])));
  assert.equal(await db.teamPerson.count({ where: { userId: concurrentUser.id } }), 1);
  const revokeUser = await user('concurrent-deactivate', cashierRole);
  const revokePerson = await db.teamPerson.create({ data: { tenantId: t.id, displayName: 'Link versus deactivate' } });
  await Promise.all([
    request(admin, `/team-people/${revokePerson.id}/account/link`, { email: revokeUser.email }, [201, 404]),
    request(admin, `/team-people/${revokePerson.id}`, { isActive: false }, 200, 'PATCH'),
  ]);
  const revokedLink = await db.teamPerson.findUnique({ where: { id: revokePerson.id } });
  assert.equal(revokedLink.isActive, false);
  if (revokedLink.userId) assert.equal((await db.user.findUnique({ where: { id: revokeUser.id } })).status, 'INACTIVE');

  // Corrections retain attribution and an append-only audit, and reject custom Admin / financial logins.
  await db.tenant.update({ where: { id: t.id }, data: { settings: { transactionEditingWindow: '1h' } } });
  const correctable = await request(admin, txPath, money('EXPENSE', { ...selection(actor.id), destination: 'Original destination' }));
  await request(admin, txPath, money('INCOME')); // make the correction use entries, not a direct balance rewrite
  const correctionPath = `/cash-transactions/${correctable.id}/corrections`;
  const correction = { requestId: randomUUID(), expectedVersion: 0, amount: 11, reason: 'Local security integration correction' };
  await request(financial, correctionPath, correction, 403);
  await request(fake, correctionPath, correction, 403);
  await request(admin, correctionPath, correction);
  const correctionEntry = await db.cashTransaction.findFirst({ where: { correctionOfId: correctable.id } });
  assert.equal(correctionEntry.staffActorPersonId, actor.id); assert.equal(correctionEntry.destination, 'Original destination');
  assert.equal(await db.cashTransactionEdit.count({ where: { transactionId: correctable.id } }), 1);

  const transfer = (extra = {}) => ({ requestId: randomUUID(), fromRegisterId: cash.id, toRegisterId: zelle.id, amount: 15, ...extra });
  const beforeTransfer = await balances();
  const input = transfer({ transferredById: actor.id });
  const first = await request(admin, '/cash-transfers', input);
  const afterTransfer = await balances();
  assert.equal(beforeTransfer.reduce((a, r) => a + Number(r[1]), 0), afterTransfer.reduce((a, r) => a + Number(r[1]), 0));
  assert.equal(await db.cashTransaction.count({ where: { referenceId: first.transfer.id, type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] } } }), 2);
  const replay = await request(admin, '/cash-transfers', input); assert.equal(replay.replayed, true); assert.deepEqual(await balances(), afterTransfer);
  for (const operator of [financial, manager, fake]) await request(operator, '/cash-transfers', transfer({ transferredById: actor.id }), 403);
  const owned = await request(financial, '/cash-transfers', transfer()); assert.equal(owned.transfer.transferredByPersonId, fp.id);
  const unlinked = await request(manager, '/cash-transfers', transfer()); assert.equal(unlinked.transfer.transferredByPersonId, null); assert.equal(unlinked.transfer.performedById, manager.id);
  await request(financial, '/cash-transfers', transfer({ toRegisterId: wrongBranch.id }), 403);
  await request(admin, '/cash-transfers', transfer({ toRegisterId: foreignAccount.id }), 403);
  await request(manager, `/cash-transfers/${first.transfer.id}/reverse`, { requestId: randomUUID(), reason: 'Unauthorized reversal' }, 403);
  await request(admin, `/cash-transfers/${first.transfer.id}/reverse`, { requestId: randomUUID(), reason: 'Integration reversal' });
  await request(admin, `/cash-transfers/${first.transfer.id}/reverse`, { requestId: randomUUID(), reason: 'Duplicate reversal' }, 422);
  // Same key in concurrent requests still produces only two ledger legs.
  const concurrent = transfer();
  const countBefore = await db.cashTransaction.count();
  await Promise.all([request(manager, '/cash-transfers', concurrent), request(manager, '/cash-transfers', concurrent)]);
  assert.equal(await db.cashTransaction.count(), countBefore + 2);
  await request(admin, '/cash-transfers', concurrent, 409);

  const linkPerson = await db.teamPerson.create({ data: { tenantId: t.id, displayName: 'Linked existing cashier' } });
  const otherPerson = await db.teamPerson.create({ data: { tenantId: t.id, displayName: 'Other person' } });
  const rolePermissionsBefore = await db.rolePermission.count({ where: { roleId: cashier.roleId } });
  await request(fake, `/team-people/${linkPerson.id}/account/link`, { email: cashier.email }, 403);
  await request(admin, `/team-people/${linkPerson.id}/account/link`, { email: cashier.email });
  await request(admin, `/team-people/${otherPerson.id}/account/link`, { email: cashier.email }, 409);
  await request(admin, `/team-people/${otherPerson.id}/account/link`, { email: admin.email }, 403);
  await request(admin, `/team-people/${otherPerson.id}/account/link`, { email: 'absent@example.test' }, 403);
  assert.equal((await db.user.findUnique({ where: { id: cashier.id } })).roleId, cashier.roleId);
  assert.equal(await db.rolePermission.count({ where: { roleId: cashier.roleId } }), rolePermissionsBefore);
  const linkedTx = await request(cashier, txPath, money()); assert.equal(linkedTx.staffActorPersonId, linkPerson.id);
  await request(admin, `/team-people/${linkPerson.id}/account`, { capabilities: ['cash.income.create'] }, 403, 'PATCH');
  await request(fake, `/team-people/${linkPerson.id}`, { isActive: false }, 403, 'PATCH');
  const deleted = await request(admin, `/team-people/${linkPerson.id}`, undefined, 200, 'DELETE'); assert.equal(deleted.result, 'ARCHIVED');
  assert.equal((await db.user.findUnique({ where: { id: cashier.id } })).status, 'INACTIVE');
  assert.equal(await db.rolePermission.count({ where: { roleId: cashier.roleId } }), rolePermissionsBefore, 'Shared Cashier role must be preserved');
  const original = await db.cashTransaction.findUnique({ where: { id: linkedTx.id } }); assert.equal(original.staffActorName, linkPerson.displayName); assert.equal(original.staffActorPersonId, linkPerson.id);
  await request(cashier, txPath, money(), 403); await request(peer, txPath, money());

  for (const state of ['inactive', 'archived', 'unlinked', 'revoked', 'wrong-branch', 'cross-tenant', 'inactive-user']) {
    await db.teamPerson.update({ where: { id: fp.id }, data: { isActive: state !== 'inactive' && state !== 'archived', archivedAt: state === 'archived' ? new Date() : null, userId: state === 'unlinked' ? null : financial.id, tenantId: state === 'cross-tenant' ? other.id : t.id } });
    await db.user.update({ where: { id: financial.id }, data: { status: state === 'inactive-user' ? 'INACTIVE' : 'ACTIVE', branchId: state === 'wrong-branch' ? b2.id : b.id } });
    if (state === 'revoked') await db.rolePermission.deleteMany({ where: { roleId: financial.roleId, permission: { key: 'cash.expense.create' } } });
    const before = await fingerprint(); await request(financial, txPath, money(), 403); assert.equal(await fingerprint(), before);
    if (state === 'revoked') await db.rolePermission.create({ data: { roleId: financial.roleId, permissionId: (await db.permission.findUnique({ where: { key: 'cash.expense.create' } })).id } });
  }
  console.log(`PASS: ${checks} isolated PostgreSQL HTTP assertions; forged requests preserved balances and row counts; transfer conservation, replay, reversal, linking and revocation verified.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); await db.$disconnect(); });
