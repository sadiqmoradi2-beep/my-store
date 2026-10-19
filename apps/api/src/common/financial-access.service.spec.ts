import { ForbiddenException } from '@nestjs/common';
import { FinancialAccessService } from './financial-access.service';
import { RolePermissionsCacheService } from './role-permissions-cache.service';

describe('FinancialAccessService', () => {
  const user = (roleId: string, roleKey = 'FP_x') => ({ userId: 'u1', roleId, roleKey }) as never;
  let prisma: { rolePermission: { findMany: jest.Mock }; teamPerson: { findFirst: jest.Mock }; cashRegister: { findMany: jest.Mock } };
  let service: FinancialAccessService;
  const grant = (...keys: string[]) => prisma.rolePermission.findMany.mockResolvedValue(keys.map((key) => ({ permission: { key } })));

  beforeEach(() => {
    prisma = { rolePermission: { findMany: jest.fn() }, teamPerson: { findFirst: jest.fn() }, cashRegister: { findMany: jest.fn() } };
    service = new FinancialAccessService(prisma as never, new RolePermissionsCacheService());
  });

  it('cash.transact covers every manual type; a capability covers only its own type', async () => {
    grant('cash.read', 'cash.transact');
    for (const t of ['INCOME', 'EXPENSE', 'WITHDRAWAL'] as const) await expect(service.assertCreateType(user('r1'), t)).resolves.toBeUndefined();
    grant('cash.read', 'cash.income.create');
    await expect(service.assertCreateType(user('r2'), 'INCOME')).resolves.toBeUndefined();
    await expect(service.assertCreateType(user('r2'), 'EXPENSE')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertCreateType(user('r2'), 'WITHDRAWAL')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertTransfer(user('r2'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a transfer needs cash.manage or cash.transfer.create', async () => {
    grant('cash.read', 'cash.transfer.create');
    await expect(service.assertTransfer(user('r3'))).resolves.toBeUndefined();
    grant('cash.manage');
    await expect(service.assertTransfer(user('r4'))).resolves.toBeUndefined();
  });

  it('a Financial Personnel login only uses accounts of its own branch; other users are not branch-limited', async () => {
    prisma.teamPerson.findFirst.mockResolvedValue({ user: { branchId: 'bA' } });
    prisma.cashRegister.findMany.mockResolvedValue([{ branchId: 'bA' }, { branchId: 'bA' }]);
    await expect(service.assertBranchScope('t1', 'u1', ['r1', 'r2'])).resolves.toBeUndefined();
    prisma.cashRegister.findMany.mockResolvedValue([{ branchId: 'bA' }, { branchId: 'bB' }]);
    await expect(service.assertBranchScope('t1', 'u1', ['r1', 'r3'])).rejects.toBeInstanceOf(ForbiddenException);
    prisma.teamPerson.findFirst.mockResolvedValue(null);
    await expect(service.assertBranchScope('t1', 'u2', ['r3'])).resolves.toBeUndefined();
  });
});
