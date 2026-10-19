import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { FINANCIAL_PERSONNEL_CAPABILITIES, FINANCIAL_PERSONNEL_ROLE_PREFIX, PERMISSIONS } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertRealStoreAdmin } from '../../common/store-admin';
import { RolePermissionsCacheService } from '../../common/role-permissions-cache.service';
import { assertPlanLimit } from '../subscriptions/subscriptions.service';
import { AuthService } from '../auth/auth.service';
import { CreatePersonAccountDto, UpdatePersonAccountDto } from './dto/team-person.dto';

const BCRYPT_ROUNDS = 10;
type Tx = Prisma.TransactionClient;

/** The hidden per-person role: cash.read (Income page) + only the capabilities the Store Admin granted */
export function roleKeyOf(personId: string) {
  return `${FINANCIAL_PERSONNEL_ROLE_PREFIX}${personId}`;
}

async function setRolePermissions(tx: Tx, roleId: string, keys: string[]) {
  const permissions = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId, permissionId: p.id })) });
}

/** Turn a login off at once: no session refresh, no permissions (the guard re-reads them), status INACTIVE */
export async function disableLogin(tx: Tx, userId: string) {
  const user = await tx.user.update({ where: { id: userId }, data: { status: 'INACTIVE', refreshTokenHash: null } });
  await tx.rolePermission.deleteMany({ where: { roleId: user.roleId } });
  return user.roleId;
}

/**
 * Team → Financial Personnel login accounts (real Store Admin only). Uses the existing invite flow: the
 * account starts with an unusable random password and the person sets their own through the emailed link.
 * Nobody ever sees a password. A new login has only cash.read until the Store Admin grants capabilities.
 */
@Injectable()
export class TeamPersonAccountService {
  private readonly logger = new Logger(TeamPersonAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly permissionsCache: RolePermissionsCacheService,
  ) {}

  /** Inside the caller's transaction: role + user + link, so a failure leaves no orphan person, user or role */
  async provision(tx: Tx, tenantId: string, person: { id: string; displayName: string }, dto: CreatePersonAccountDto) {
    const email = dto.email.trim().toLowerCase();
    if (await tx.user.findUnique({ where: { email } })) {
      throw new ConflictException('This email is already registered — use another email');
    }
    const branch = await tx.branch.findFirst({ where: { id: dto.branchId, tenantId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found');
    const capabilities = sanitizeCapabilities(dto.capabilities);
    const role = await tx.role.create({
      data: { tenantId, key: roleKeyOf(person.id), name: `Financial Personnel: ${person.displayName}`.slice(0, 100), isSystem: false },
    });
    await setRolePermissions(tx, role.id, [PERMISSIONS.CASH_READ, ...capabilities]);
    const user = await tx.user.create({
      data: {
        tenantId,
        email,
        // unusable until the person sets their own password through the invite link
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), BCRYPT_ROUNDS),
        fullName: person.displayName,
        roleId: role.id,
        branchId: branch.id,
      },
    });
    await tx.teamPerson.update({ where: { id: person.id }, data: { userId: user.id } });
    return user;
  }

  /** After the commit: email the "set up your account" link (a mail outage never undoes the account) */
  async invite(user: { id: string; email: string; locale: string }) {
    return this.auth
      .sendAccountInvite(user)
      .then(() => true)
      .catch((err) => {
        this.logger.error(`Failed to send account-invite email to ${user.email}`, err);
        return false;
      });
  }

  /** Create a login for an existing person */
  async create(tenantId: string, adminId: string, personId: string, dto: CreatePersonAccountDto) {
    await assertRealStoreAdmin(this.prisma, tenantId, adminId);
    await assertPlanLimit(this.prisma, tenantId, 'users');
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TeamPerson" WHERE id = ${personId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const person = await tx.teamPerson.findFirst({ where: { id: personId, tenantId } });
      if (!person) throw new NotFoundException('Person not found');
      if (person.archivedAt) throw new UnprocessableEntityException('This person was deleted (archived)');
      if (person.userId) throw new ConflictException('This person already has a login account');
      return this.provision(tx, tenantId, person, dto);
    });
    return { inviteSent: await this.invite(user) };
  }

  /** Grant / revoke capabilities, move branch, or turn the login on / off — effective immediately */
  async update(tenantId: string, adminId: string, personId: string, dto: UpdatePersonAccountDto) {
    await assertRealStoreAdmin(this.prisma, tenantId, adminId);
    const roleId = await this.prisma.$transaction(async (tx) => {
      const person = await tx.teamPerson.findFirst({ where: { id: personId, tenantId }, include: { user: true } });
      if (!person?.user) throw new NotFoundException('This person has no login account');
      if (person.archivedAt) throw new UnprocessableEntityException('This person was deleted (archived)');
      const user = person.user;
      if (dto.branchId) {
        const branch = await tx.branch.findFirst({ where: { id: dto.branchId, tenantId }, select: { id: true } });
        if (!branch) throw new NotFoundException('Branch not found');
        await tx.user.update({ where: { id: user.id }, data: { branchId: branch.id } });
      }
      if (dto.loginEnabled === false) return disableLogin(tx, user.id);
      const enabling = dto.loginEnabled === true && user.status !== 'ACTIVE';
      if (enabling) await tx.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
      if (dto.capabilities !== undefined || enabling) {
        const current = dto.capabilities ?? (await this.capabilitiesOf(tx, user.roleId));
        if (user.status === 'ACTIVE' || enabling) {
          await setRolePermissions(tx, user.roleId, [PERMISSIONS.CASH_READ, ...sanitizeCapabilities(current)]);
        } else {
          throw new UnprocessableEntityException('Turn the login on to grant capabilities');
        }
      }
      return user.roleId;
    });
    this.permissionsCache.invalidate(roleId);
    return { updated: true };
  }

  async resendInvite(tenantId: string, adminId: string, personId: string) {
    await assertRealStoreAdmin(this.prisma, tenantId, adminId);
    const person = await this.prisma.teamPerson.findFirst({ where: { id: personId, tenantId, archivedAt: null }, include: { user: true } });
    if (!person?.user) throw new NotFoundException('This person has no login account');
    if (person.user.status !== 'ACTIVE') throw new UnprocessableEntityException('Turn the login on first');
    return { inviteSent: await this.invite(person.user) };
  }

  private async capabilitiesOf(tx: Tx, roleId: string) {
    const rows = await tx.rolePermission.findMany({ where: { roleId }, include: { permission: { select: { key: true } } } });
    return rows.map((r) => r.permission.key);
  }
}

/** Only the four Financial Personnel capabilities can ever be granted here — nothing privileged */
function sanitizeCapabilities(keys: string[] | undefined) {
  return [...new Set(keys ?? [])].filter((k) => (FINANCIAL_PERSONNEL_CAPABILITIES as readonly string[]).includes(k));
}
