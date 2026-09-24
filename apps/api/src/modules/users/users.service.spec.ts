import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    findMany: jest.Mock;
    findById: jest.Mock;
    findByEmail: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };
  let prisma: {
    subscription: { findUnique: jest.Mock };
    user: { count: jest.Mock };
    role: { findUnique: jest.Mock };
  };

  const dto = {
    email: 'kar@mystore.af',
    password: 'Password@123',
    fullName: 'Test User',
    roleId: 'role-1',
    branchId: 'branch-1',
  };

  beforeEach(async () => {
    repo = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => ({
        id: 'user-new',
        role: { key: 'SELLER' },
        ...data,
      })),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { limits: { maxUsers: 5 } } }),
      },
      user: { count: jest.fn().mockResolvedValue(1) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-1', key: 'SELLER', tenantId: null }) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('creating a user at the plan limit → 400', async () => {
    prisma.user.count.mockResolvedValue(5);
    await expect(service.create('t1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('duplicate email → 409', async () => {
    repo.findByEmail.mockResolvedValue({ id: 'existing' });
    await expect(service.create('t1', dto)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('assigning the SUPER_ADMIN role is not allowed', async () => {
    prisma.role.findUnique.mockResolvedValue({ id: 'role-1', key: 'SUPER_ADMIN', tenantId: null });
    await expect(service.create('t1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('assigning a role that belongs to another store is not allowed', async () => {
    prisma.role.findUnique.mockResolvedValue({ id: 'role-1', key: 'SELLER', tenantId: 'other-tenant' });
    await expect(service.create('t1', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('the password is hashed, not stored as plain text', async () => {
    const result = await service.create('t1', dto);
    const data = repo.create.mock.calls[0][0];
    expect(data.password).toBeUndefined();
    expect(data.passwordHash).toBeDefined();
    expect(data.passwordHash).not.toBe(dto.password);
    expect(data.passwordHash.length).toBeGreaterThan(20);
    expect((result as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('you cannot delete your own account', async () => {
    await expect(service.remove('t1', 'u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});
