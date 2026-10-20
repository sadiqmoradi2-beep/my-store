import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FINANCIAL_PERSONNEL_ROLE_PREFIX } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertRealStoreAdmin } from '../../common/store-admin';
import { CreateTeamPersonDto, UpdateTeamPersonDto } from './dto/team-person.dto';
import { RolePermissionsCacheService } from '../../common/role-permissions-cache.service';
import { assertPlanLimit } from '../subscriptions/subscriptions.service';
import { TeamPersonAccountService, disableLogin } from './team-person-account.service';

const clean = (name: string) => name.trim().replace(/\s+/g, ' ');

/**
 * Team → Financial Personnel: people who are neither employees nor partners (no payroll). A login is optional
 * (Store Admin only, see TeamPersonAccountService). Never removed while financial history names them — archived.
 */
@Injectable()
export class TeamPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: TeamPersonAccountService,
    private readonly permissionsCache: RolePermissionsCacheService,
  ) {}

  /** Login details (email, capabilities) only for the real Store Admin */
  async list(tenantId: string, userId?: string) {
    const isAdmin = userId ? await assertRealStoreAdmin(this.prisma, tenantId, userId).then(() => true, () => false) : false;
    const people = await this.prisma.teamPerson.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true, email: true, status: true, branchId: true,
            branch: { select: { name: true } },
            role: { select: { key: true, rolePermissions: { select: { permission: { select: { key: true } } } } } },
          },
        },
      },
      orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { isActive: 'desc' }, { displayName: 'asc' }],
    });
    return people.map(({ user, userId: _u, ...p }) => ({
      ...p,
      hasAccount: !!user,
      account:
        isAdmin && user
          ? {
              userId: user.id,
              email: user.email,
              loginEnabled: user.status === 'ACTIVE',
              branchId: user.branchId,
              branchName: user.branch?.name ?? null,
              capabilities: user.role.rolePermissions.map((rp) => rp.permission.key).filter((k) => k !== 'cash.read'),
              managed: user.role.key === `${FINANCIAL_PERSONNEL_ROLE_PREFIX}${p.id}`,
            }
          : null,
    }));
  }

  async create(tenantId: string, dto: CreateTeamPersonDto, userId?: string) {
    await assertRealStoreAdmin(this.prisma, tenantId, userId ?? '');
    const displayName = clean(dto.displayName);
    await this.assertNameFree(tenantId, displayName);
    if (!dto.account) {
      return this.save(() => this.prisma.teamPerson.create({ data: { tenantId, displayName, notes: dto.notes?.trim() || null } }));
    }
    // "Create Account": Store Admin only; person + role + login in one transaction, invite emailed after it
    await assertRealStoreAdmin(this.prisma, tenantId, userId ?? '');
    await assertPlanLimit(this.prisma, tenantId, 'users');
    const { person, user } = await this.save(() =>
      this.prisma.$transaction(async (tx) => {
        const person = await tx.teamPerson.create({ data: { tenantId, displayName, notes: dto.notes?.trim() || null } });
        const user = await this.accounts.provision(tx, tenantId, person, dto.account!);
        return { person, user };
      }),
    );
    const { userId: _u, ...safe } = person;
    return { ...safe, hasAccount: true, inviteSent: await this.accounts.invite(user) };
  }

  async update(tenantId: string, id: string, dto: UpdateTeamPersonDto, userId?: string) {
    await assertRealStoreAdmin(this.prisma, tenantId, userId ?? '');
    const person = await this.prisma.teamPerson.findFirst({ where: { id, tenantId } });
    if (!person) throw new NotFoundException('Person not found');
    if (person.archivedAt) throw new UnprocessableEntityException('This person was deleted (archived) and can no longer be changed');
    const displayName = dto.displayName !== undefined ? clean(dto.displayName) : undefined;
    if (displayName && displayName.toLowerCase() !== person.displayName.toLowerCase()) {
      await this.assertNameFree(tenantId, displayName, id);
    }
    const updated = await this.save(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "TeamPerson" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
        const current = await tx.teamPerson.findFirst({ where: { id, tenantId } });
        if (!current) throw new NotFoundException('Person not found');
        if (current.archivedAt) throw new UnprocessableEntityException('This person was deleted (archived)');
        const row = await tx.teamPerson.update({
          where: { id },
          data: {
            ...(displayName && { displayName }),
            ...(dto.notes !== undefined && { notes: dto.notes.trim() || null }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
        });
        // A linked existing User keeps its own name and role; this edits only the TeamPerson.
        // deactivating the person also turns the login off at once (turning it back on is a separate step)
        const roleId = current.userId && dto.isActive === false ? await disableLogin(tx, tenantId, current.userId) : null;
        return { row, roleId };
      }),
    );
    if (updated.roleId) this.permissionsCache.invalidate(updated.roleId);
    const { userId: _u, ...safe } = updated.row;
    return { ...safe, hasAccount: !!updated.row.userId };
  }

  /**
   * Everyone selectable as Paid By / Who Is Paid: active employees (sellers are employees), active
   * partners and active team people — each from its own table, so nothing is duplicated.
   */
  async directory(tenantId: string) {
    const [employees, partners, people] = await Promise.all([
      this.prisma.employee.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, fullName: true, position: true }, orderBy: { fullName: 'asc' } }),
      this.prisma.partner.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.teamPerson.findMany({ where: { tenantId, isActive: true, archivedAt: null }, select: { id: true, displayName: true, user: { select: { tenantId: true, status: true, deletedAt: true, branchId: true, branch: { select: { isActive: true } } } } }, orderBy: { displayName: 'asc' } }),
    ]);
    return [
      ...employees.map((e) => ({ kind: 'EMPLOYEE' as const, id: e.id, name: e.fullName, detail: e.position })),
      ...partners.map((p) => ({ kind: 'PARTNER' as const, id: p.id, name: p.name, detail: null })),
      ...people.map((p) => ({ kind: 'PERSON' as const, id: p.id, name: p.displayName, detail: null, branchId: p.user?.branchId ?? null,
        actorEligible: !p.user || (p.user.tenantId === tenantId && p.user.status === 'ACTIVE' && !p.user.deletedAt && !!p.user.branch?.isActive) })),
    ];
  }

  /**
   * Delete (real Store Admin only). Someone named on any transaction or transfer is archived instead: hidden from
   * new selections, name and links kept, so history never changes. Nobody referenced → removed for good.
   */
  async remove(tenantId: string, userId: string, id: string) {
    await assertRealStoreAdmin(this.prisma, tenantId, userId);
    const roleIds: string[] = [];
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TeamPerson" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const person = await tx.teamPerson.findFirst({ where: { id, tenantId } });
      if (!person) throw new NotFoundException('Person not found');
      if (person.archivedAt) {
        if (person.userId) roleIds.push(await disableLogin(tx, tenantId, person.userId));
        return { result: 'ARCHIVED' as const, references: null };
      }
      const [transactions, transfers, recorded] = await Promise.all([
        tx.cashTransaction.count({
          where: { tenantId, OR: [{ paidByPersonId: id }, { receivedByPersonId: id }, { transferredByPersonId: id }, { staffActorPersonId: id }] },
        }),
        tx.cashTransfer.count({ where: { tenantId, transferredByPersonId: id } }),
        // money movements recorded by this person's login: that user row is part of the history too
        person.userId
          ? Promise.all([
              tx.cashTransaction.count({ where: { performedById: person.userId } }),
              tx.cashTransfer.count({ where: { performedById: person.userId } }),
            ]).then(([a, b]) => a + b)
          : Promise.resolve(0),
      ]);
      const login = person.userId ? await tx.user.findUnique({ where: { id: person.userId }, include: { role: true } }) : null;
      if (transactions + transfers + recorded > 0 || person.userId) {
        await tx.teamPerson.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
        if (login) roleIds.push(await disableLogin(tx, tenantId, login.id));
        return { result: 'ARCHIVED' as const, references: { transactions, transfers, recorded } };
      }
      await tx.teamPerson.delete({ where: { id } });
      return { result: 'DELETED' as const, references: { transactions: 0, transfers: 0, recorded: 0 } };
    });
    for (const roleId of roleIds) this.permissionsCache.invalidate(roleId);
    return outcome;
  }

  private async assertNameFree(tenantId: string, displayName: string, exceptId?: string) {
    const taken = await this.prisma.teamPerson.findFirst({
      where: { tenantId, archivedAt: null, displayName: { equals: displayName, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (taken) throw new ConflictException('A person with this name is already registered');
  }

  /** The DB unique index (store + case-insensitive name) is the final guard against a simultaneous duplicate */
  private async save<T>(op: () => Promise<T>) {
    try {
      return await op();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A person with this name is already registered');
      }
      throw e;
    }
  }
}
