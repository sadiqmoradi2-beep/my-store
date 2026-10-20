import { ForbiddenException } from '@nestjs/common';
import { financialIdentity, resolveFinancialActor } from './financial-actor';

export function actorDb() {
  const user = {
    id: 'u1', tenantId: 't1', fullName: 'Operator', branchId: 'b1', status: 'ACTIVE', deletedAt: null,
    branch: { id: 'b1', tenantId: 't1', isActive: true },
    role: { key: 'CASHIER', tenantId: null as string | null, isSystem: true,
      rolePermissions: ['cash.transact', 'cash.manage'].map((key) => ({ permission: { key } })) },
  };
  const person = { id: 'p1', tenantId: 't1', displayName: 'Collector', isActive: true, archivedAt: null as Date | null, userId: 'u1', user };
  const db = {
    user: { findFirst: jest.fn().mockResolvedValue(user) },
    teamPerson: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(person) },
    cashRegister: { findMany: jest.fn().mockResolvedValue([{ id: 'r1', branchId: 'b1' }]) },
  };
  return { db, user, person };
}

describe('live financial actor authorization', () => {
  it.each(['', '   ', null])('rejects an explicitly invalid actor %s rather than treating it as omitted', async (id) => {
    const { db, user } = actorDb(); user.role.key = 'ADMIN';
    await expect(resolveFinancialActor(db as never, 't1', 'u1', 'EXPENSE', ['r1'], id as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['INCOME', 'EXPENSE', 'WITHDRAWAL', 'TRANSFER'] as const)('only built-in Store Admin selects another actor for %s', async (operation) => {
    const { db, user } = actorDb();
    await expect(resolveFinancialActor(db as never, 't1', 'u1', operation, ['r1'], 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    user.role.key = 'ADMIN'; user.role.isSystem = false; user.role.tenantId = 't1';
    await expect(resolveFinancialActor(db as never, 't1', 'u1', operation, ['r1'], 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    user.role.isSystem = true; user.role.tenantId = null;
    await expect(resolveFinancialActor(db as never, 't1', 'u1', operation, ['r1'], 'p1')).resolves.toMatchObject({ actor: { id: 'p1' } });
  });

  it.each(['INCOME', 'EXPENSE', 'WITHDRAWAL', 'TRANSFER'] as const)('links automatically and rejects tampering for %s', async (operation) => {
    const { db, person } = actorDb();
    db.teamPerson.findUnique.mockResolvedValue(person);
    await expect(resolveFinancialActor(db as never, 't1', 'u1', operation, ['r1'])).resolves.toMatchObject({ actor: { id: 'p1', name: 'Collector' } });
    await expect(resolveFinancialActor(db as never, 't1', 'u1', operation, ['r1'], 'p1')).resolves.toBeDefined();
    await expect(resolveFinancialActor(db as never, 't1', 'u1', operation, ['r1'], 'p2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['CASHIER', 'BRANCH_MANAGER'])('preserves %s permissions without inventing personnel', async (role) => {
    const { db, user } = actorDb(); user.role.key = role;
    const result = await resolveFinancialActor(db as never, 't1', 'u1', 'EXPENSE', ['r1']);
    expect(result.actor).toBeUndefined(); expect(result.user.id).toBe('u1');
  });

  it('rejects revoked or deleted users using a live query', async () => {
    const { db } = actorDb(); db.user.findFirst.mockResolvedValue(null);
    await expect(financialIdentity(db as never, 't1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1', tenantId: 't1', deletedAt: null, status: 'ACTIVE' } }));
  });

  it.each(['inactive', 'archived', 'cross-tenant', 'wrong-branch', 'inactive-branch', 'missing-branch', 'unlinked', 'revoked'])('rejects %s Financial Personnel', async (scenario) => {
    const { db, person, user } = actorDb(); db.teamPerson.findUnique.mockResolvedValue(person);
    if (scenario === 'inactive') person.isActive = false;
    if (scenario === 'archived') person.archivedAt = new Date();
    if (scenario === 'cross-tenant') person.tenantId = 't2';
    if (scenario === 'wrong-branch') db.cashRegister.findMany.mockResolvedValue([{ id: 'r1', branchId: 'b2' }]);
    if (scenario === 'inactive-branch') user.branch.isActive = false;
    if (scenario === 'missing-branch') user.branchId = '';
    if (scenario === 'unlinked') { db.teamPerson.findUnique.mockResolvedValue(null); user.role.key = 'FP_p1'; }
    if (scenario === 'revoked') user.role.rolePermissions = [];
    await expect(resolveFinancialActor(db as never, 't1', 'u1', 'EXPENSE', ['r1'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unavailable or cross-tenant destination accounts, including partially missing transfers', async () => {
    const { db } = actorDb();
    await expect(resolveFinancialActor(db as never, 't1', 'u1', 'TRANSFER', ['r1', 'foreign'])).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.cashRegister.findMany).toHaveBeenCalledWith({ where: { tenantId: 't1', id: { in: ['r1', 'foreign'] }, isActive: true, branch: { isActive: true } } });
  });

  it('a link grants no operation or privileged permissions', async () => {
    const { db, person, user } = actorDb(); db.teamPerson.findUnique.mockResolvedValue(person);
    user.role.rolePermissions = [{ permission: { key: 'cash.income.create' } }];
    await expect(resolveFinancialActor(db as never, 't1', 'u1', 'INCOME', ['r1'])).resolves.toBeDefined();
    for (const op of ['EXPENSE', 'WITHDRAWAL', 'TRANSFER'] as const) await expect(resolveFinancialActor(db as never, 't1', 'u1', op, ['r1'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admin cannot select Employees, Partners, inactive or foreign personnel as staff actors', async () => {
    const { db, user } = actorDb(); user.role.key = 'ADMIN'; db.teamPerson.findFirst.mockResolvedValue(null);
    await expect(resolveFinancialActor(db as never, 't1', 'u1', 'EXPENSE', ['r1'], 'employee-id')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.teamPerson.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'employee-id', tenantId: 't1', isActive: true, archivedAt: null } }));
  });
});
