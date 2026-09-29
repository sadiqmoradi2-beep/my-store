import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SellersService } from '../sellers/sellers.service';
import { EmployeesService } from './employees.service';

const D = (v: number) => new Prisma.Decimal(v);
const sellersServiceMock = { create: jest.fn(), paySalary: jest.fn() };

describe('EmployeesService.paySalary', () => {
  let service: EmployeesService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  const employee = { id: 'emp1', tenantId: 't1', fullName: 'Ahmad', salary: D(1000) };

  beforeEach(async () => {
    tx = {
      salaryPayment: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'sp1', ...data })),
      },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue({ balance: D(1000), isActive: true }),
        update: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
      workSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ ...employee }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('with a register → a salary payment row + an EXPENSE register transaction', async () => {
    await service.paySalary('t1', 'u1', 'emp1', {
      amount: 500,
      period: '1405-04',
      registerId: 'reg1',
    });
    const paymentData = tx.salaryPayment.create.mock.calls[0][0].data;
    expect(paymentData.amount.toString()).toBe('500');
    expect(paymentData.period).toBe('1405-04');
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.type).toBe('EXPENSE');
    expect(cashData.category).toBe('Salary');
    expect(cashData.note).toContain('Ahmad');
  });

  it('without a register → only the payment row, no register effect', async () => {
    await service.paySalary('t1', 'u1', 'emp1', { amount: 500, period: '1405-04' });
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
    expect(tx.salaryPayment.create).toHaveBeenCalled();
  });

  it('employee not found → 404 and no transaction', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(
      service.paySalary('t1', 'u1', 'missing', { amount: 500, period: '1405-04' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('EmployeesService.create', () => {
  let service: EmployeesService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    tx = {
      user: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'user-new', ...data })),
      },
      employee: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'emp-new', ...data })),
      },
    };
    prisma = {
      employee: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'emp-new', ...data })),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { limits: { maxUsers: -1 }, name: 'BUSINESS' } }),
      },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-seller' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };
    sellersServiceMock.create.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('without email → only an employee record, no user account', async () => {
    const result = await service.create('t1', {
      fullName: 'Zahra',
      position: 'Seller',
      salary: 5000,
    });
    expect(prisma.employee.create).toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect((result as { tempPassword?: string }).tempPassword).toBeUndefined();
  });

  it('with email → a user account is created with the position\'s matching role + a temp password is returned', async () => {
    const result = await service.create('t1', {
      fullName: 'Zahra',
      position: 'Seller',
      positionPreset: 'SELLER',
      salary: 5000,
      email: 'zahra@demo.af',
    });
    expect(prisma.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'SELLER' }) }),
    );
    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.email).toBe('zahra@demo.af');
    expect(userData.roleId).toBe('role-seller');
    const empData = tx.employee.create.mock.calls[0][0].data;
    expect(empData.userId).toBe('user-new');
    const tempPassword = (result as { tempPassword?: string }).tempPassword;
    expect(tempPassword).toBeDefined();
    expect(typeof tempPassword).toBe('string');
  });

  it('positionPreset SELLER → a linked seller profile is created via SellersService, carrying pay/commission fields', async () => {
    await service.create('t1', {
      fullName: 'Zahra',
      position: 'Seller',
      positionPreset: 'SELLER',
      payType: 'COMMISSION',
      commissionPercent: 12.5,
      salary: 0,
      email: 'zahra@demo.af',
    });
    expect(sellersServiceMock.create).toHaveBeenCalledWith('t1', {
      userId: 'user-new',
      payType: 'COMMISSION',
      commissionPercent: 12.5,
      fixedSalaryAmount: undefined,
    });
  });

  it('positionPreset other than SELLER → no seller profile is created', async () => {
    await service.create('t1', {
      fullName: 'Karim',
      position: 'Worker',
      positionPreset: 'WORKER',
      salary: 4000,
      email: 'karim2@demo.af',
    });
    expect(sellersServiceMock.create).not.toHaveBeenCalled();
  });

  it('positionPreset SELLER but no login created (no email) → no seller profile either (no user to link)', async () => {
    await service.create('t1', {
      fullName: 'Zahra',
      position: 'Seller',
      positionPreset: 'SELLER',
      salary: 0,
    });
    expect(sellersServiceMock.create).not.toHaveBeenCalled();
  });

  it('with roleId → overrides the positionPreset-derived role (custom manager role)', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: 'role-custom-manager' });
    await service.create('t1', {
      fullName: 'Karim',
      position: 'Manager',
      positionPreset: 'MANAGER',
      salary: 8000,
      email: 'karim@demo.af',
      roleId: 'role-custom-manager',
    });
    expect(prisma.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'role-custom-manager' }) }),
    );
    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.roleId).toBe('role-custom-manager');
  });

  it('roleId not found for this tenant → 404 and no transaction', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    await expect(
      service.create('t1', {
        fullName: 'Karim',
        position: 'Manager',
        salary: 8000,
        email: 'karim@demo.af',
        roleId: 'not-mine',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('email already registered → 409 and no transaction', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create('t1', { fullName: 'Zahra', position: 'Seller', salary: 5000, email: 'zahra@demo.af' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('createLogin=false with email → no user account', async () => {
    await service.create('t1', {
      fullName: 'Zahra',
      position: 'Seller',
      salary: 5000,
      email: 'zahra@demo.af',
      createLogin: false,
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(prisma.employee.create).toHaveBeenCalled();
  });
});

describe('EmployeesService.payCommission', () => {
  let service: EmployeesService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp1', tenantId: 't1', userId: 'user-1' }),
      },
      sellerProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'seller-1', userId: 'user-1' }),
      },
    };
    sellersServiceMock.paySalary.mockReset().mockResolvedValue({ id: 'payment-1' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('resolves the employee\'s linked seller profile and delegates to SellersService.paySalary', async () => {
    const dto = { amount: 200, period: '1405-07' } as never;
    await service.payCommission('t1', 'admin-1', 'emp1', dto);
    expect(prisma.sellerProfile.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', tenantId: 't1' },
    });
    expect(sellersServiceMock.paySalary).toHaveBeenCalledWith('t1', 'admin-1', 'seller-1', dto);
  });

  it('employee has no linked user → 404, never calls SellersService', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'emp1', tenantId: 't1', userId: null });
    await expect(
      service.payCommission('t1', 'admin-1', 'emp1', { amount: 200, period: '1405-07' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sellersServiceMock.paySalary).not.toHaveBeenCalled();
  });

  it('employee has a user but no linked seller profile → 404', async () => {
    prisma.sellerProfile.findFirst.mockResolvedValue(null);
    await expect(
      service.payCommission('t1', 'admin-1', 'emp1', { amount: 200, period: '1405-07' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sellersServiceMock.paySalary).not.toHaveBeenCalled();
  });
});

describe('EmployeesService.list', () => {
  let service: EmployeesService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'emp1', tenantId: 't1', userId: 'user-1', fullName: 'Ali', isActive: true },
          { id: 'emp2', tenantId: 't1', userId: 'user-2', fullName: 'Sara', isActive: true },
          { id: 'emp3', tenantId: 't1', userId: null, fullName: 'NoLogin', isActive: true },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user-1', roleId: 'role-seller', role: { name: 'Seller' } },
          { id: 'user-2', roleId: 'role-worker', role: { name: 'Worker' } },
        ]),
      },
      sellerProfile: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'seller-1', userId: 'user-1', commissionPercent: D(10) },
        ]),
      },
      sale: { groupBy: jest.fn().mockResolvedValue([{ createdById: 'user-1', _count: { _all: 3 }, _sum: { total: D(900) } }]) },
      commissionEntry: {
        groupBy: jest.fn().mockResolvedValue([{ sellerProfileId: 'seller-1', _sum: { amount: D(90) } }]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('an employee with a linked seller profile gets commission/sales stats merged in', async () => {
    const result = await service.list('t1');
    const ali = result.find((e) => e.id === 'emp1')!;
    expect(ali.sellerProfileId).toBe('seller-1');
    expect(ali.commissionPercent?.toString()).toBe('10');
    expect(ali.salesCount).toBe(3);
    expect(ali.salesTotal?.toString()).toBe('900');
    expect(ali.commissionTotal?.toString()).toBe('90');
    expect(ali.roleName).toBe('Seller');
  });

  it('a plain employee (no seller profile) gets nulls for every commission field', async () => {
    const result = await service.list('t1');
    const sara = result.find((e) => e.id === 'emp2')!;
    expect(sara.sellerProfileId).toBeNull();
    expect(sara.commissionPercent).toBeNull();
    expect(sara.salesCount).toBeNull();
    expect(sara.roleName).toBe('Worker');
  });

  it('an employee with no linked login account gets nulls for role and seller fields, no crash', async () => {
    const result = await service.list('t1');
    const noLogin = result.find((e) => e.id === 'emp3')!;
    expect(noLogin.roleId).toBeNull();
    expect(noLogin.sellerProfileId).toBeNull();
  });
});

describe('EmployeesService.startShift/endShift', () => {
  let service: EmployeesService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  const employee = { id: 'emp1', tenantId: 't1' };

  beforeEach(async () => {
    prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ ...employee }) },
      employeeShift: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'shift1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'shift1', ...data })),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('start shift: no open shift → recorded', async () => {
    await service.startShift('t1', 'u1', 'emp1', { openingCash: 1000 });
    const data = prisma.employeeShift.create.mock.calls[0][0].data;
    expect(data.openingCash.toString()).toBe('1000');
    expect(data.startedById).toBe('u1');
  });

  it('start shift: an open shift already exists → error', async () => {
    prisma.employeeShift.findFirst.mockResolvedValue({ id: 'open-shift' });
    await expect(service.startShift('t1', 'u1', 'emp1', { openingCash: 1000 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('end shift: closing cash balance is recorded', async () => {
    prisma.employeeShift.findFirst.mockResolvedValue({ id: 'shift1', endedAt: null });
    await service.endShift('t1', 'u2', 'emp1', 'shift1', { closingCash: 900 });
    const data = prisma.employeeShift.update.mock.calls[0][0].data;
    expect(data.closingCash.toString()).toBe('900');
    expect(data.endedById).toBe('u2');
  });

  it('end shift: shift already closed → error', async () => {
    prisma.employeeShift.findFirst.mockResolvedValue({ id: 'shift1', endedAt: new Date() });
    await expect(
      service.endShift('t1', 'u2', 'emp1', 'shift1', { closingCash: 900 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('end shift: shift not found → 404', async () => {
    prisma.employeeShift.findFirst.mockResolvedValue(null);
    await expect(
      service.endShift('t1', 'u2', 'emp1', 'missing', { closingCash: 900 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EmployeesService.attendance/markAttendance', () => {
  let service: EmployeesService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  const employee = { id: 'emp1', tenantId: 't1' };

  beforeEach(async () => {
    prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ ...employee }) },
      employeeAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }) => ({ id: 'att1', ...create })),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('mark attendance: upserts on [employeeId, date] with status and recorder', async () => {
    await service.markAttendance('t1', 'u1', 'emp1', { date: '2026-07-20', status: 'PRESENT' });
    const call = prisma.employeeAttendance.upsert.mock.calls[0][0];
    expect(call.where.employeeId_date).toEqual({ employeeId: 'emp1', date: new Date('2026-07-20') });
    expect(call.create.status).toBe('PRESENT');
    expect(call.create.recordedById).toBe('u1');
  });

  it('employee not found → 404 and nothing recorded', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(
      service.markAttendance('t1', 'u1', 'missing', { date: '2026-07-20', status: 'ABSENT' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employeeAttendance.upsert).not.toHaveBeenCalled();
  });

  it('attendance list: no from/to → uses the current month\'s range', async () => {
    await service.attendance('t1', 'emp1', {});
    const where = prisma.employeeAttendance.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.employeeId).toBe('emp1');
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
  });
});
