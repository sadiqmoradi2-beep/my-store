import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { recordCommission, SellersService } from './sellers.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('SellersService', () => {
  let service: SellersService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'user-new', ...data })),
      },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-seller' }) },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { limits: { maxUsers: -1 }, name: 'BUSINESS' } }),
      },
      sellerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'sp1', tenantId: 't1', commissionPercent: D(5) }),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'sp1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'sp1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sale: { groupBy: jest.fn().mockResolvedValue([]) },
      commissionEntry: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SellersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SellersService);
  });

  describe('create', () => {
    it('user not found → 404', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.create('t1', { userId: 'u1', commissionPercent: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('duplicate profile for the user → 409', async () => {
      prisma.sellerProfile.findUnique.mockResolvedValue({ id: 'sp1' });
      await expect(
        service.create('t1', { userId: 'u1', commissionPercent: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.sellerProfile.create).not.toHaveBeenCalled();
    });

    it('success → commission percent is stored as a Decimal', async () => {
      await service.create('t1', { userId: 'u1', commissionPercent: 7.5, notes: 'Note' });
      const data = prisma.sellerProfile.create.mock.calls[0][0].data;
      expect(data.commissionPercent.toString()).toBe('7.5');
      expect(data.notes).toBe('Note');
    });

    it('payType=FIXED_SALARY → fixedSalaryAmount is stored', async () => {
      await service.create('t1', { userId: 'u1', payType: 'FIXED_SALARY', fixedSalaryAmount: 8000 });
      const data = prisma.sellerProfile.create.mock.calls[0][0].data;
      expect(data.payType).toBe('FIXED_SALARY');
      expect(data.fixedSalaryAmount.toString()).toBe('8000');
    });

    it('no userId, no fullName/email → 400', async () => {
      await expect(service.create('t1', { commissionPercent: 5 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('fullName+email → creates a new SELLER-role account and returns a temp password', async () => {
      const result = await service.create('t1', {
        fullName: 'New Seller',
        email: 'newseller@demo.af',
        commissionPercent: 10,
      });
      expect(prisma.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ key: 'SELLER' }) }),
      );
      const userData = prisma.user.create.mock.calls[0][0].data;
      expect(userData.email).toBe('newseller@demo.af');
      expect(userData.roleId).toBe('role-seller');
      const profileData = prisma.sellerProfile.create.mock.calls[0][0].data;
      expect(profileData.userId).toBe('user-new');
      expect((result as { tempPassword?: string }).tempPassword).toEqual(expect.any(String));
    });

    it('email already registered → 409 and no user created', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create('t1', { fullName: 'New Seller', email: 'dup@demo.af' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('profile not found → 404', async () => {
      prisma.sellerProfile.findFirst.mockResolvedValue(null);
      await expect(service.update('t1', 'sp-x', { isActive: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('fields not submitted are not included in data', async () => {
      await service.update('t1', 'sp1', { isActive: false });
      const data = prisma.sellerProfile.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('commissionPercent');
      expect(data).not.toHaveProperty('notes');
      expect(data.isActive).toBe(false);
    });
  });

  describe('list', () => {
    it('seller with no sales/commission → defaults to zero', async () => {
      prisma.sellerProfile.findMany.mockResolvedValue([
        {
          id: 'sp1',
          userId: 'u1',
          user: { fullName: 'Ali', email: 'a@x.com', roleId: 'role-seller', role: { name: 'Seller' } },
        },
      ]);
      const result = await service.list('t1');
      expect(result[0].salesCount).toBe(0);
      expect(result[0].salesTotal.toString()).toBe('0');
      expect(result[0].commissionTotal.toString()).toBe('0');
      expect(result[0].fullName).toBe('Ali');
      expect(result[0].roleName).toBe('Seller');
    });

    it('sale and commission stats are mapped to the corresponding seller', async () => {
      prisma.sellerProfile.findMany.mockResolvedValue([
        {
          id: 'sp1',
          userId: 'u1',
          user: { fullName: 'Ali', email: 'a@x.com', roleId: 'role-seller', role: { name: 'Seller' } },
        },
      ]);
      prisma.sale.groupBy.mockResolvedValue([
        { createdById: 'u1', _count: { _all: 4 }, _sum: { total: D(4000) } },
      ]);
      prisma.commissionEntry.groupBy.mockResolvedValue([
        { sellerProfileId: 'sp1', _sum: { amount: D(200) } },
      ]);
      const result = await service.list('t1');
      expect(result[0].salesCount).toBe(4);
      expect(result[0].salesTotal.toString()).toBe('4000');
      expect(result[0].commissionTotal.toString()).toBe('200');
    });
  });
});

describe('SellersService.paySalary', () => {
  let service: SellersService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    tx = {
      sellerSalaryPayment: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'ssp1', ...data })),
      },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue({ balance: D(1000), isActive: true }),
        update: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
      workSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      sellerProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sp1', tenantId: 't1', payType: 'FIXED_SALARY' }),
      },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [SellersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SellersService);
  });

  it('fixed-salary seller + register → payment row + EXPENSE cost', async () => {
    await service.paySalary('t1', 'u1', 'sp1', { amount: 500, period: '1405-04', registerId: 'reg1' });
    const paymentData = tx.sellerSalaryPayment.create.mock.calls[0][0].data;
    expect(paymentData.amount.toString()).toBe('500');
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.type).toBe('EXPENSE');
  });
});

describe('recordCommission', () => {
  const order = { id: 'o1', saleNumber: 12, total: D(1000), createdById: 'u1' };

  function buildTx(profile: unknown, existing: unknown = null) {
    return {
      sellerProfile: { findFirst: jest.fn().mockResolvedValue(profile) },
      commissionEntry: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'ce1', ...data })),
      },
    };
  }

  it('no active profile → nothing is recorded', async () => {
    const tx = buildTx(null);
    const result = await recordCommission(tx as never, 't1', order);
    expect(result).toBeNull();
    expect(tx.commissionEntry.create).not.toHaveBeenCalled();
  });

  it('zero commission percent → nothing is recorded', async () => {
    const tx = buildTx({ id: 'sp1', commissionPercent: D(0) });
    const result = await recordCommission(tx as never, 't1', order);
    expect(result).toBeNull();
  });

  it('fixed-salary seller (FIXED_SALARY) → no commission is recorded', async () => {
    const tx = buildTx({ id: 'sp1', payType: 'FIXED_SALARY', commissionPercent: D(5) });
    const result = await recordCommission(tx as never, 't1', order);
    expect(result).toBeNull();
    expect(tx.commissionEntry.create).not.toHaveBeenCalled();
  });

  it('commission already recorded → no duplicate, the existing record is returned', async () => {
    const existing = { id: 'ce-existing' };
    const tx = buildTx({ id: 'sp1', commissionPercent: D(5) }, existing);
    const result = await recordCommission(tx as never, 't1', order);
    expect(result).toBe(existing);
    expect(tx.commissionEntry.create).not.toHaveBeenCalled();
  });

  it('success → the commission amount is calculated and recorded', async () => {
    const tx = buildTx({ id: 'sp1', commissionPercent: D(5) });
    const result = await recordCommission(tx as never, 't1', order);
    // 1000 * 5% = 50
    const data = tx.commissionEntry.create.mock.calls[0][0].data;
    expect(data.amount.toString()).toBe('50');
    expect(data.saleId).toBe('o1');
    expect(data.saleNumber).toBe(12);
    expect(data.percent.toString()).toBe('5');
    expect(result).toEqual(expect.objectContaining({ id: 'ce1' }));
  });
});
