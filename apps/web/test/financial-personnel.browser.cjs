/* Local production build, fixture API only. Every non-local request is intercepted; production is never contacted. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const messages = require('../messages/en.json');
const t = messages.cash;
const origin = 'http://127.0.0.1:55441';
let browser, checks = 0;
async function scenario(kind) {
  const isAdmin = kind === 'admin'; const linked = kind === 'financial';
  const user = { id: kind, tenantId: 't1', fullName: `${kind} operator`, roleKey: isAdmin || kind === 'fake-admin' ? 'ADMIN' : linked ? 'FP_p1' : kind === 'manager' ? 'BRANCH_MANAGER' : 'CASHIER',
    branchId: 'b1', locale: 'en', calendar: 'GREGORIAN', theme: 'light', uiPrefs: null, twoFactorEnabled: false,
    permissions: ['cash.read', 'cash.transact', 'cash.manage', 'employees.read', 'employees.manage', 'partners.manage', 'partners.read'] };
  const registers = [
    { id: 'r1', branchId: 'b1', branchName: 'Main', part: 'CASH', name: 'Cash account', balance: '1000', isActive: true },
    { id: 'r2', branchId: 'b1', branchName: 'Main', part: 'ZELLE', name: 'Zelle account', balance: '1000', isActive: true },
    { id: 'r3', branchId: 'b2', branchName: 'Other branch', part: 'CARD', name: 'Other account', balance: '1000', isActive: true },
  ];
  const directory = [{ kind: 'PERSON', id: 'p1', name: 'Own financial identity' }, { kind: 'PERSON', id: 'p2', name: 'Other financial person' },
    { kind: 'EMPLOYEE', id: 'e1', name: 'Employee recipient' }, { kind: 'PARTNER', id: 'par1', name: 'Partner recipient' }];
  const people = [{ id: 'p1', displayName: 'Own financial identity', isActive: true, archivedAt: null, notes: '', createdAt: new Date().toISOString(), account: null }];
  const writes = [], errors = [], unknown = [];
  const context = await browser.newContext();
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    let data = null, meta;
    if (path === '/auth/refresh') data = { accessToken: 'fixture-token', user };
    else if (path === '/notifications/unread-count') data = { count: 0 };
    else if (path === '/modules/enabled') data = ['cash-register', 'employees', 'partners'];
    else if (path === '/cash-registers') data = registers;
    else if (path === '/cash-registers/income-summary') data = { totals: { totalIncome: '0', totalSales: '0', salesCount: 0, totalProfit: '0', totalBalance: '3000' },
      parts: registers.map((r) => ({ part: r.part, balance: r.balance, income: '0', expenses: '0', profit: '0' })) };
    else if (path === '/team-people/actor-context') data = { canSelectActor: isAdmin, actor: linked ? { id: 'p1', name: 'Own financial identity' } : null, operatorName: user.fullName, branchId: 'b1' };
    else if (path === '/team-people/directory') data = directory;
    else if (path === '/team-people' && route.request().method() === 'GET') data = people;
    else if (path === '/employees') data = [{ id: 'e1', fullName: 'Employee recipient', isActive: true, payType: 'FIXED_SALARY', salary: '100' }];
    else if (path === '/sellers' || path === '/partners') data = [];
    else if (path === '/work-sessions/mine') data = null;
    else if (path === '/branches') data = [{ id: 'b1', name: 'Main' }];
    else if (/\/transactions$/.test(path) && route.request().method() === 'GET') { data = []; meta = { page: 1, limit: 20, total: 0, totalPages: 0 }; }
    else if (route.request().method() === 'POST' && ['/cash-registers/r1/transactions', '/cash-transfers', '/team-people/p1/account/link', '/employees/e1/salary-payments'].includes(path)) {
      writes.push({ path, body: route.request().postDataJSON() }); data = { id: 'saved' };
      if (path.endsWith('/account/link')) people[0].account = { userId: 'cashier', email: 'cashier@example.test', loginEnabled: true, branchId: 'b1', branchName: 'Main', managed: false, capabilities: ['cash.transact'] };
    } else { unknown.push(path); return route.abort(); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, ...(meta && { meta }) }) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/en/income`);
  await page.getByRole('button', { name: t.newTransaction, exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(t.category).selectOption('Rent');
  const actor = dialog.getByLabel(t.paidByPerson);
  if (isAdmin) {
    await actor.selectOption('p2');
    assert.deepEqual(await actor.locator('option').evaluateAll((options) => options.map((o) => o.value).filter(Boolean)), ['p1', 'p2']); checks++;
  } else {
    await actor.waitFor(); assert.equal(await actor.inputValue(), linked ? 'Own financial identity' : user.fullName);
    assert.equal(await actor.getAttribute('readonly'), ''); checks++;
  }
  await dialog.getByLabel(t.whoIsPaid).selectOption('EMPLOYEE:e1');
  await dialog.getByLabel(t.destination).fill('Employee bank');
  await dialog.getByLabel(t.amount).fill('10');
  await dialog.getByRole('button', { name: messages.common.save, exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const manual = writes.find((w) => w.path.endsWith('/transactions')).body;
  assert.deepEqual(manual.receivedBy, { kind: 'EMPLOYEE', id: 'e1' }); assert.equal(manual.destination, 'Employee bank');
  if (isAdmin) assert.equal(manual.personnel.personId, 'p2'); else assert.equal(manual.personnel, undefined); checks++;

  await page.getByRole('button', { name: t.newTransaction, exact: true }).click(); dialog = page.getByRole('dialog');
  await dialog.getByLabel(t.type || t.txType).selectOption('TRANSFER');
  const transferActor = dialog.getByLabel(t.transfer.by);
  if (isAdmin) await transferActor.selectOption('p2');
  else { await transferActor.waitFor(); assert.equal(await transferActor.inputValue(), linked ? 'Own financial identity' : user.fullName); assert.equal(await transferActor.getAttribute('readonly'), ''); }
  const destination = dialog.getByLabel(t.transfer.to);
  if (linked) assert.equal(await destination.locator('option[value="r3"]').count(), 0); checks++;
  await destination.selectOption('r2'); await dialog.getByLabel(t.amount).fill('5');
  await dialog.getByRole('button', { name: t.transfer.save, exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const transfer = writes.find((w) => w.path === '/cash-transfers').body;
  assert.equal(transfer.transferredById, isAdmin ? 'p2' : undefined); checks++;

  for (const type of ['INCOME', 'WITHDRAWAL']) {
    await page.getByRole('button', { name: t.newTransaction, exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByLabel(t.txType).selectOption(type);
    if (type === 'WITHDRAWAL') await dialog.getByLabel(t.category).selectOption('Other');
    const staff = dialog.getByLabel(type === 'INCOME' ? t.collectedBy : t.paidByPerson);
    if (isAdmin) await staff.selectOption('p2');
    else { await staff.waitFor(); assert.equal(await staff.inputValue(), linked ? 'Own financial identity' : user.fullName); }
    await dialog.getByLabel(type === 'INCOME' ? t.externalPayer : t.whoIsPaid).selectOption(type === 'INCOME' ? 'PARTNER:par1' : 'EMPLOYEE:e1');
    await dialog.getByLabel(t.amount).fill('6');
    await dialog.getByRole('button', { name: messages.common.save, exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    const body = writes.filter((w) => w.path.endsWith('/transactions')).at(-1).body;
    assert.equal(body.type, type); assert.equal(body[type === 'INCOME' ? 'paidBy' : 'receivedBy'].id, type === 'INCOME' ? 'par1' : 'e1');
    if (!isAdmin) assert.equal(body.personnel, undefined); checks++;
  }

  if (isAdmin) {
    // Linked salary still names its Employee recipient; Paid By uses the separate actor control.
    await page.getByRole('button', { name: t.newTransaction, exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByLabel(t.person, { exact: false }).filter({ has: page.locator('option[value="e1"]') }).selectOption('e1');
    await dialog.getByLabel(t.paidByPerson).selectOption('p2');
    await dialog.getByRole('button', { name: messages.common.save, exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    const salary = writes.find((w) => w.path === '/employees/e1/salary-payments').body;
    assert.equal(salary.paidByPersonId, 'p2'); assert.equal(salary.registerId, 'r1'); checks++;
    await page.goto(`${origin}/en/team/people`);
    await page.getByRole('button', { name: messages.teamPeople.access, exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByLabel(messages.teamPeople.linkExisting).check();
    await dialog.getByLabel(messages.teamPeople.email, { exact: false }).fill('cashier@example.test');
    await dialog.getByRole('button', { name: messages.teamPeople.linkExisting, exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes.find((w) => w.path.endsWith('/account/link')).body, { email: 'cashier@example.test' }); checks++;
    await page.getByText(messages.teamPeople.existingRolePermissions, { exact: false }).waitFor(); checks++;
    await page.getByRole('button', { name: messages.teamPeople.access, exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByText(messages.teamPeople.linkedExistingHint, { exact: true }).waitFor();
    assert.equal(await dialog.locator('input[type="checkbox"]').count(), 0); checks++;
    await dialog.getByRole('button', { name: messages.common.cancel, exact: true }).click();
    await page.getByRole('button', { name: messages.teamPeople.add, exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByLabel(messages.teamPeople.createAccount).check();
    assert.equal(await dialog.locator('input[type="email"]').count(), 1); assert.equal(await dialog.locator('input[type="password"]').count(), 0); checks++;
    await dialog.getByRole('button', { name: messages.common.cancel, exact: true }).click();
    await page.getByRole('button', { name: messages.teamPeople.delete, exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: messages.teamPeople.deleteConfirm, exact: true }).waitFor(); checks++;
    await dialog.getByRole('button', { name: messages.common.cancel, exact: true }).click();
  }
  if (kind === 'fake-admin') {
    await page.goto(`${origin}/en/team/people`);
    await page.getByRole('cell', { name: 'Own financial identity', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: messages.teamPeople.access, exact: true }).count(), 0); checks++;
  }
  assert.deepEqual(errors, [], 'Browser runtime errors'); assert.deepEqual(unknown, [], 'Unexpected external requests');
  await context.close();
}
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  for (const kind of ['admin', 'financial', 'cashier', 'manager', 'fake-admin']) await scenario(kind);
  console.log(`PASS: ${checks} local browser checks across Store Admin, Financial Personnel, unlinked Cashier/Branch Manager and custom ADMIN; no production requests.`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
