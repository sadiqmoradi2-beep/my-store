import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    strategy = moduleRef.get(JwtStrategy);
  });

  it('active user → returns the RequestUser from the payload', async () => {
    prisma.user.findUnique.mockResolvedValue({ deletedAt: null, status: 'ACTIVE' });
    const result = await strategy.validate({ sub: 'u1', tenantId: 't1', roleId: 'r1', roleKey: 'SELLER' } as never);
    expect(result).toEqual({ userId: 'u1', sub: 'u1', tenantId: 't1', roleId: 'r1', roleKey: 'SELLER' });
  });

  it('deleted user → 401, even with a validly-signed unexpired token', async () => {
    prisma.user.findUnique.mockResolvedValue({ deletedAt: new Date(), status: 'INACTIVE' });
    await expect(strategy.validate({ sub: 'u1' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deactivated (non-ACTIVE) user → 401', async () => {
    prisma.user.findUnique.mockResolvedValue({ deletedAt: null, status: 'SUSPENDED' });
    await expect(strategy.validate({ sub: 'u1' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('user of a suspended store → 401 (existing sessions are cut off)', async () => {
    prisma.user.findUnique.mockResolvedValue({ deletedAt: null, status: 'ACTIVE', tenant: { isActive: false } });
    await expect(strategy.validate({ sub: 'u1' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('platform super admin (no store) → allowed', async () => {
    prisma.user.findUnique.mockResolvedValue({ deletedAt: null, status: 'ACTIVE', tenant: null });
    await expect(strategy.validate({ sub: 'sa', roleKey: 'SUPER_ADMIN' } as never)).resolves.toBeTruthy();
  });

  it('user no longer exists → 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'u1' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('no sub in payload → 401, no database lookup', async () => {
    await expect(strategy.validate({} as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('repeated validate() for the same user within the cache window → only one database lookup', async () => {
    prisma.user.findUnique.mockResolvedValue({ deletedAt: null, status: 'ACTIVE' });
    await strategy.validate({ sub: 'u1' } as never);
    await strategy.validate({ sub: 'u1' } as never);
    await strategy.validate({ sub: 'u1' } as never);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
