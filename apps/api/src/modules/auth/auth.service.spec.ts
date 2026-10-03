import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let repo: {
    findUserByEmail: jest.Mock;
    findUserById: jest.Mock;
    updateRefreshTokenHash: jest.Mock;
    markLogin: jest.Mock;
    slugExists: jest.Mock;
    findSystemRole: jest.Mock;
    updateResetToken: jest.Mock;
    findPlan: jest.Mock;
    findCoreModules: jest.Mock;
  };
  let prisma: {
    user: { update: jest.Mock };
    licenseKey: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    user: { create: jest.Mock };
    tenant: { create: jest.Mock };
    licenseKey: { updateMany: jest.Mock };
    branch: { create: jest.Mock };
    warehouse: { create: jest.Mock };
    subscription: { create: jest.Mock };
    tenantModule: { createMany: jest.Mock };
  };
  let mail: { send: jest.Mock };

  const baseUser = {
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.af',
    fullName: 'Test',
    roleId: 'r1',
    branchId: null,
    status: 'ACTIVE',
    deletedAt: null,
    locale: 'fa',
    calendar: 'GREGORIAN',
    theme: 'system',
    refreshTokenHash: null as string | null,
    role: { key: 'ADMIN', rolePermissions: [] },
  };

  beforeEach(async () => {
    repo = {
      findUserByEmail: jest.fn(),
      findUserById: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      markLogin: jest.fn(),
      slugExists: jest.fn(),
      findSystemRole: jest.fn(),
      updateResetToken: jest.fn(),
      findPlan: jest.fn().mockResolvedValue({ id: 'plan-free' }),
      findCoreModules: jest.fn().mockResolvedValue([]),
    };
    tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'u2' }) },
      tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-new' }) },
      licenseKey: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      branch: { create: jest.fn().mockResolvedValue({ id: 'branch-new' }) },
      warehouse: { create: jest.fn() },
      subscription: { create: jest.fn() },
      tenantModule: { createMany: jest.fn() },
    };
    prisma = {
      user: { update: jest.fn() },
      licenseKey: { findUnique: jest.fn().mockResolvedValue({ key: 'LICENSE-1', status: 'ACTIVE' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed-token'),
            verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn((_k: string, d?: string) => d ?? 'secret') } },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('login with correct password → token + save refresh hash', async () => {
    const passwordHash = await bcrypt.hash('Correct@123', 4);
    repo.findUserByEmail.mockResolvedValue({ ...baseUser, passwordHash });

    const result = await service.login({ email: 'a@b.af', password: 'Correct@123' });
    if ('requires2fa' in result) throw new Error('Unexpected 2FA');
    expect(result.accessToken).toBe('signed-token');
    expect(result.user.email).toBe('a@b.af');
    expect(repo.updateRefreshTokenHash).toHaveBeenCalledWith('u1', expect.any(String));
  });

  it('login with wrong password → 401', async () => {
    const passwordHash = await bcrypt.hash('Correct@123', 4);
    repo.findUserByEmail.mockResolvedValue({ ...baseUser, passwordHash });
    await expect(service.login({ email: 'a@b.af', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('user of a suspended store → 401 even with the right password', async () => {
    const passwordHash = await bcrypt.hash('Correct@123', 4);
    repo.findUserByEmail.mockResolvedValue({ ...baseUser, passwordHash, tenant: { isActive: false } });
    await expect(service.login({ email: 'a@b.af', password: 'Correct@123' })).rejects.toThrow('suspended');
    expect(repo.updateRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('inactive user → 401', async () => {
    repo.findUserByEmail.mockResolvedValue({ ...baseUser, status: 'SUSPENDED', passwordHash: 'x' });
    await expect(service.login({ email: 'a@b.af', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('reuse of a rotated refresh token → revoke all sessions', async () => {
    const otherHash = await bcrypt.hash('different-token', 4);
    repo.findUserById.mockResolvedValue({ ...baseUser, passwordHash: 'x', refreshTokenHash: otherHash });

    await expect(service.refresh('stale-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.updateRefreshTokenHash).toHaveBeenCalledWith('u1', null);
  });

  it('valid refresh → new token (rotation)', async () => {
    const validHash = await bcrypt.hash('valid-token', 4);
    repo.findUserById.mockResolvedValue({ ...baseUser, passwordHash: 'x', refreshTokenHash: validHash });

    const result = await service.refresh('valid-token');
    expect(result.accessToken).toBe('signed-token');
    expect(repo.updateRefreshTokenHash).toHaveBeenLastCalledWith('u1', expect.any(String));
  });

  describe('registerTenant', () => {
    const dto = {
      storeName: 'New Store',
      slug: 'new-store',
      fullName: 'Store Owner',
      email: 'owner@newstore.af',
      password: 'Owner@1234',
      licenseKey: 'LICENSE-1',
    };

    beforeEach(() => {
      repo.slugExists.mockResolvedValue(null);
      repo.findUserByEmail.mockResolvedValue(null);
      repo.findSystemRole.mockResolvedValue({ id: 'r-admin' });
      repo.findUserById.mockResolvedValue({
        ...baseUser,
        id: 'u2',
        tenantId: 'tenant-new',
        role: { key: 'ADMIN', rolePermissions: [] },
      });
    });

    it('no license key found → 400 and no transaction started', async () => {
      prisma.licenseKey.findUnique.mockResolvedValue(null);
      await expect(service.registerTenant(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('license key already used → 400 and no transaction started', async () => {
      prisma.licenseKey.findUnique.mockResolvedValue({ key: 'LICENSE-1', status: 'USED' });
      await expect(service.registerTenant(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('license key expired → 400 and no transaction started', async () => {
      prisma.licenseKey.findUnique.mockResolvedValue({
        key: 'LICENSE-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.registerTenant(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('valid license key → tenant created and the key is marked USED against the new tenant', async () => {
      const result = await service.registerTenant(dto);
      expect(tx.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'New Store', slug: 'new-store' }) }),
      );
      expect(tx.licenseKey.updateMany).toHaveBeenCalledWith({
        where: {
          key: 'LICENSE-1',
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }],
        },
        data: { status: 'USED', usedByTenantId: 'tenant-new', usedAt: expect.any(Date) },
      });
      expect(result.accessToken).toBe('signed-token');
    });

    it('key consumed by a concurrent request between the pre-check and the transaction → 409, everything rolled back', async () => {
      tx.licenseKey.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.registerTenant(dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('slug already taken → 409 and no license key lookup', async () => {
      repo.slugExists.mockResolvedValue({ id: 't-existing' });
      await expect(service.registerTenant(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.licenseKey.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('changeEmail', () => {
    it('correct current password + new email available → successful update', async () => {
      const passwordHash = await bcrypt.hash('Correct@123', 4);
      repo.findUserById.mockResolvedValue({ ...baseUser, passwordHash });
      repo.findUserByEmail.mockResolvedValue(null);

      await service.changeEmail('u1', { newEmail: 'new@b.af', currentPassword: 'Correct@123' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { email: 'new@b.af' },
      });
    });

    it('wrong current password → 401', async () => {
      const passwordHash = await bcrypt.hash('Correct@123', 4);
      repo.findUserById.mockResolvedValue({ ...baseUser, passwordHash });
      await expect(
        service.changeEmail('u1', { newEmail: 'new@b.af', currentPassword: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('new email already registered to another user → 409', async () => {
      const passwordHash = await bcrypt.hash('Correct@123', 4);
      repo.findUserById.mockResolvedValue({ ...baseUser, passwordHash });
      repo.findUserByEmail.mockResolvedValue({ id: 'someone-else' });
      await expect(
        service.changeEmail('u1', { newEmail: 'taken@b.af', currentPassword: 'Correct@123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('disableTwoFactor', () => {
    it('wrong current password → 401, rejected before the TOTP code is even checked', async () => {
      const passwordHash = await bcrypt.hash('Correct@123', 4);
      repo.findUserById.mockResolvedValue({
        ...baseUser,
        passwordHash,
        totpEnabledAt: new Date(),
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      await expect(
        service.disableTwoFactor('u1', '000000', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('correct current password → new password saved + refreshTokenHash revoked', async () => {
      const passwordHash = await bcrypt.hash('Correct@123', 4);
      repo.findUserById.mockResolvedValue({ ...baseUser, passwordHash });

      await service.changePassword('u1', { currentPassword: 'Correct@123', newPassword: 'NewPass@123' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: expect.any(String), refreshTokenHash: null },
      });
    });

    it('wrong current password → 401', async () => {
      const passwordHash = await bcrypt.hash('Correct@123', 4);
      repo.findUserById.mockResolvedValue({ ...baseUser, passwordHash });
      await expect(
        service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'NewPass@123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('existing email → token saved + email sent', async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser, passwordHash: 'x' });
      const result = await service.forgotPassword({ email: 'a@b.af' });
      expect(repo.updateResetToken).toHaveBeenCalledWith('u1', expect.any(String), expect.any(Date));
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.af', subject: expect.any(String) }),
      );
      expect(result.message).toEqual(expect.any(String));
    });

    it('unknown email → no token/email, same generic response (no account existence disclosure)', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: 'unknown@b.af' });
      expect(repo.updateResetToken).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
      expect(result.message).toEqual(expect.any(String));
    });
  });

  describe('resetPassword', () => {
    it('valid, non-expired token → new password saved + token and refreshTokenHash cleared', async () => {
      const tokenHash = await bcrypt.hash('raw-reset-token', 4);
      repo.findUserByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash: 'x',
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      await service.resetPassword({ email: 'a@b.af', token: 'raw-reset-token', newPassword: 'NewPass@123' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          passwordHash: expect.any(String),
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          refreshTokenHash: null,
        },
      });
    });

    it('expired token → error', async () => {
      const tokenHash = await bcrypt.hash('raw-reset-token', 4);
      repo.findUserByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash: 'x',
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: new Date(Date.now() - 60_000),
      });
      await expect(
        service.resetPassword({ email: 'a@b.af', token: 'raw-reset-token', newPassword: 'NewPass@123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('incorrect token → error', async () => {
      const tokenHash = await bcrypt.hash('raw-reset-token', 4);
      repo.findUserByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash: 'x',
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      await expect(
        service.resetPassword({ email: 'a@b.af', token: 'wrong-token', newPassword: 'NewPass@123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('unknown email → error', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      await expect(
        service.resetPassword({ email: 'unknown@b.af', token: 'x', newPassword: 'NewPass@123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
