import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuthUser, JwtPayload, LoginResponse, ROLES, RoleKey, TwoFactorRequired } from '@my-store/shared';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthRepository } from './auth.repository';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

type UserWithRole = NonNullable<Awaited<ReturnType<AuthRepository['findUserByEmail']>>>;

export interface AuthResult extends LoginResponse {
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async registerTenant(dto: RegisterTenantDto): Promise<AuthResult> {
    if (await this.repo.slugExists(dto.slug)) {
      throw new ConflictException('This store ID is already taken');
    }
    if (await this.repo.findUserByEmail(dto.email)) {
      throw new ConflictException('This email is already registered');
    }
    const licenseKey = await this.prisma.licenseKey.findUnique({ where: { key: dto.licenseKey } });
    if (!licenseKey || licenseKey.status !== 'ACTIVE') {
      throw new BadRequestException('This license key is invalid, already used, or has been revoked');
    }
    if (licenseKey.expiresAt && licenseKey.expiresAt < new Date()) {
      throw new BadRequestException('This license key has expired');
    }

    const adminRole = await this.repo.findSystemRole(ROLES.ADMIN);
    const freePlan = await this.repo.findPlan('FREE');
    const coreModules = await this.repo.findCoreModules();
    if (!adminRole || !freePlan) {
      throw new ConflictException('System base data has not been seeded');
    }
    const grantedPlanId = licenseKey.planId ?? freePlan.id;

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const userId = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.storeName, slug: dto.slug, phone: dto.phone },
      });
      const consumed = await tx.licenseKey.updateMany({
        where: {
          key: dto.licenseKey,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        data: { status: 'USED', usedByTenantId: tenant.id, usedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw new ConflictException('This license key is invalid, already used, or has been revoked');
      }
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Main Branch',
          code: 'MAIN',
          isMain: true,
        },
      });
      await tx.warehouse.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          name: 'Main Warehouse',
          isDefault: true,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone,
          roleId: adminRole.id,
          branchId: branch.id,
        },
      });
      await tx.subscription.create({
        data: { tenantId: tenant.id, planId: grantedPlanId, status: 'ACTIVE' },
      });
      if (coreModules.length) {
        await tx.tenantModule.createMany({
          data: coreModules.map((m) => ({ tenantId: tenant.id, moduleId: m.id, enabled: true })),
        });
      }
      return user.id;
    });

    const user = await this.repo.findUserById(userId);
    return this.issueTokens(user!);
  }

  async login(dto: LoginDto): Promise<AuthResult | TwoFactorRequired> {
    const user = await this.repo.findUserByEmail(dto.email);
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Incorrect email or password');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    if (user.totpEnabledAt && user.totpSecret) {
      if (!dto.totpCode) return { requires2fa: true };
      if (!verifyTotp(user.totpSecret, dto.totpCode)) {
        throw new UnauthorizedException('Incorrect two-factor code');
      }
    }
    await this.repo.markLogin(user.id);
    return this.issueTokens(user);
  }

  /** Start 2FA activation — generates a new secret; not active until the code is confirmed */
  async setupTwoFactor(userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedException();
    if (user.totpEnabledAt) throw new BadRequestException('2FA is already enabled');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  async enableTwoFactor(userId: string, code: string): Promise<AuthUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedException();
    if (user.totpEnabledAt) throw new BadRequestException('2FA is already enabled');
    if (!user.totpSecret) throw new BadRequestException('Call setup first');
    if (!verifyTotp(user.totpSecret, code)) {
      throw new BadRequestException('Incorrect verification code — try again');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
    return this.me(userId);
  }

  async disableTwoFactor(userId: string, code: string): Promise<AuthUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedException();
    if (!user.totpEnabledAt || !user.totpSecret) {
      throw new BadRequestException('2FA is not enabled');
    }
    if (!verifyTotp(user.totpSecret, code)) {
      throw new BadRequestException('Incorrect verification code');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null },
    });
    return this.me(userId);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.repo.findUserById(payload.sub);
    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid session');
    }
    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      // Reuse of a rotated token — invalidate all sessions
      await this.repo.updateRefreshTokenHash(user.id, null);
      throw new UnauthorizedException('Invalid session');
    }
    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.repo.updateRefreshTokenHash(userId, null);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedException();
    return this.toAuthUser(user);
  }

  private async issueTokens(user: UserWithRole): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      roleKey: user.role.key as RoleKey,
    };
    const accessToken = await this.jwt.signAsync(
      { ...payload },
      {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get('jwt.accessTtl', '15m') as JwtSignOptions['expiresIn'],
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...payload },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshTtl', '7d') as JwtSignOptions['expiresIn'],
      },
    );
    await this.repo.updateRefreshTokenHash(user.id, await bcrypt.hash(refreshToken, BCRYPT_ROUNDS));
    return { accessToken, refreshToken, user: this.toAuthUser(user) };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Session expired');
    }
  }

  private toAuthUser(user: UserWithRole): AuthUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      roleKey: user.role.key as RoleKey,
      branchId: user.branchId,
      locale: user.locale as AuthUser['locale'],
      calendar: user.calendar,
      theme: user.theme as AuthUser['theme'],
      uiPrefs: (user.uiPrefs as AuthUser['uiPrefs']) ?? null,
      twoFactorEnabled: user.totpEnabledAt !== null,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.key),
    };
  }

  /** Update panel personalization — merges with the previous value */
  async updateUiPrefs(userId: string, prefs: Record<string, unknown>): Promise<AuthUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const current = (user.uiPrefs ?? {}) as Record<string, unknown>;
    const given = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== undefined));
    await this.prisma.user.update({
      where: { id: userId },
      data: { uiPrefs: { ...current, ...given } as Prisma.InputJsonValue },
    });
    return this.me(userId);
  }

  /** Change email — requires confirming the current password */
  async changeEmail(userId: string, dto: ChangeEmailDto): Promise<AuthUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    if (dto.newEmail !== user.email && (await this.repo.findUserByEmail(dto.newEmail))) {
      throw new ConflictException('This email is already registered');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { email: dto.newEmail } });
    return this.me(userId);
  }

  /** Change password — requires confirming the current password; all other sessions are invalidated */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshTokenHash: null },
    });
    return this.me(userId);
  }

  /** Password recovery request — always returns the same public response (does not reveal whether the email exists) */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.repo.findUserByEmail(dto.email);
    if (user && !user.deletedAt) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await this.repo.updateResetToken(user.id, tokenHash, expiresAt);

      const webOrigin = this.config.get<string>('webOrigin');
      const resetUrl = `${webOrigin}/${user.locale}/reset-password?email=${encodeURIComponent(user.email)}&token=${rawToken}`;
      await this.mail.send({
        to: user.email,
        subject: 'Reset your MY STORE password',
        html: `<p>Click the link below to set a new password (valid for 30 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      });
    }
    return { message: 'If this email is registered, a reset link has been sent to it' };
  }

  /** Set a new password with the reset token — the reason it's invalid (missing user/expired/mismatch) is not revealed */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const invalidLink = () => new BadRequestException('The reset link is invalid or has expired');
    const user = await this.repo.findUserByEmail(dto.email);
    if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) throw invalidLink();
    if (user.resetTokenExpiresAt.getTime() < Date.now()) throw invalidLink();
    const matches = await bcrypt.compare(dto.token, user.resetTokenHash);
    if (!matches) throw invalidLink();

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null, refreshTokenHash: null },
    });
    return { message: 'Password changed successfully' };
  }
}
