import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SellersService } from '../sellers/sellers.service';
import { UsersService } from '../users/users.service';
import { WorkSessionsService } from '../work-sessions/work-sessions.service';
import { EmployeesService } from './employees.service';

const D = (v: number) => new Prisma.Decimal(v);
const sellersServiceMock = { create: jest.fn(), paySalary: jest.fn() };
const authServiceMock = { sendAccountInvite: jest.fn().mockResolvedValue(undefined) };
const usersServiceMock = { remove: jest.fn() };
const workSessionsServiceMock = { close: jest.fn() };

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
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: WorkSessionsService, useValue: workSessionsServiceMock },
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
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: { limits: { maxUsers: -1 }, name: 'BUSINESS' } }),
      },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-seller' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };
    sellersServiceMock.create.mockReset();
    authServiceMock.sendAccountInvite.mockReset().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: WorkSessionsService, useValue: workSessionsServiceMock },
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
    expect((result as { inviteSent?: boolean }).inviteSent).toBeUndefined();
    expect(authServiceMock.sendAccountInvite).not.toHaveBeenCalled();
  });

  it('with email → a user account is created with the position\'s matching role + an invite email is sent', async () => {
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
    expect(authServiceMock.sendAccountInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'zahra@demo.af' }),
    );
    expect((result as { inviteSent?: boolean }).inviteSent).toBe(true);
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

  it('positionPreset WORKER → payType is always FIXED_SALARY, even if COMMISSION is requested', async () => {
    await service.create('t1', {
      fullName: 'Karim',
      position: 'Worker',
      positionPreset: 'WORKER',
      payType: 'COMMISSION',
      salary: 4000,
      email: 'karim3@demo.af',
    });
    expect(tx.employee.create.mock.calls[0][0].data.payType).toBe('FIXED_SALARY');
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

  it('roleId pointing at SUPER_ADMIN → excluded from the query, 404 (never assignable through this endpoint)', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    await expect(
      service.create('t1', {
        fullName: 'Karim',
        position: 'Manager',
        positionPreset: 'MANAGER',
        salary: 8000,
        email: 'karim@demo.af',
        roleId: 'role-super-admin',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.role.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: { not: 'SUPER_ADMIN' } }) }),
    );
    expect(tx.user.create).not.toHaveBeenCalled();
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
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
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
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: WorkSessionsService, useValue: workSessionsServiceMock },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

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
      workSession: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: WorkSessionsService, useValue: workSessionsServiceMock },
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
    expect(prisma.workSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', sellerProfileId: { in: ['seller-1'] } } }),
    );
  });

  it('sessionProfit sums salesProfit across the seller\'s work sessions, not their lifetime sale total', async () => {
    prisma.workSession.findMany.mockResolvedValue([
      {
        id: 'ws1', tenantId: 't1', sellerProfileId: 'seller-1', employeeId: null, partnerId: null,
        startedAt: new Date('2026-01-01'), closedAt: new Date('2026-01-02'),
        openingCash: D(0), harvestLimit: D(0),
      },
    ]);
    // Sale rows feeding computeFigures's first $queryRaw call (sales grouped by session/method)
    prisma.$queryRaw
      .mockResolvedValueOnce([{ sessionId: 'ws1', method: 'CASH', total: D(500), cost: D(300), n: 2 }])
      .mockResolvedValue([]);
    const result = await service.list('t1');
    const ali = result.find((e) => e.id === 'emp1')!;
    expect(ali.sessionProfit?.toString()).toBe('200'); // 500 - 300, independent of the 900 lifetime sales total
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

  it('an employee whose login was deleted (deletedAt set) is excluded from the list entirely', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', roleId: 'role-seller', role: { name: 'Seller' }, deletedAt: new Date() },
      { id: 'user-2', roleId: 'role-worker', role: { name: 'Worker' }, deletedAt: null },
    ]);
    const result = await service.list('t1');
    expect(result.find((e) => e.id === 'emp1')).toBeUndefined();
    expect(result.find((e) => e.id === 'emp2')).toBeDefined();
    expect(result.find((e) => e.id === 'emp3')).toBeDefined();
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
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: WorkSessionsService, useValue: workSessionsServiceMock },
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
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: WorkSessionsService, useValue: workSessionsServiceMock },
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

describe('EmployeesService.remove', () => {
  let service: EmployeesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const employee = { id: 'emp1', tenantId: 't1', userId: 'user1' };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ ...employee }),
        update: jest.fn(),
      },
      sellerProfile: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      workSession: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    usersServiceMock.remove.mockReset();
    workSessionsServiceMock.close.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SellersService, useValue: sellersServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: WorkSessionsService, useValue: workSessionsServiceMock },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('no login, no open session → just soft-deletes the employee record', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'emp1', tenantId: 't1', userId: null });
    await service.remove('t1', 'admin1', 'emp1');
    expect(usersServiceMock.remove).not.toHaveBeenCalled();
    expect(workSessionsServiceMock.close).not.toHaveBeenCalled();
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('with a login → the login is also soft-deleted', async () => {
    await service.remove('t1', 'admin1', 'emp1');
    expect(usersServiceMock.remove).toHaveBeenCalledWith('t1', 'user1', 'admin1');
  });

  it('with an open work session tied to the employee → the session is closed before deletion', async () => {
    prisma.workSession.findMany.mockResolvedValue([
      {
        id: 'ws1', tenantId: 't1', status: 'ACTIVE', employeeId: 'emp1', sellerProfileId: null,
        openingCash: D(0), harvestLimit: D(0),
      },
    ]);
    await service.remove('t1', 'admin1', 'emp1');
    expect(workSessionsServiceMock.close).toHaveBeenCalledWith(
      't1', 'admin1', 'ws1',
      expect.objectContaining({ actualClosingCash: expect.any(Number) }),
    );
  });

  it('seller with an open session under their seller profile → that session is closed too', async () => {
    prisma.sellerProfile.findFirst.mockResolvedValue({ id: 'sp1', tenantId: 't1', userId: 'user1' });
    prisma.workSession.findMany.mockResolvedValue([
      {
        id: 'ws2', tenantId: 't1', status: 'ACTIVE', employeeId: null, sellerProfileId: 'sp1',
        openingCash: D(0), harvestLimit: D(0),
      },
    ]);
    await service.remove('t1', 'admin1', 'emp1');
    expect(prisma.workSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ employeeId: 'emp1' }, { sellerProfileId: 'sp1' }],
        }),
      }),
    );
    expect(workSessionsServiceMock.close).toHaveBeenCalledWith('t1', 'admin1', 'ws2', expect.anything());
  });

  it('employee is a seller → their seller profile is deactivated too (so they stop showing up to start a new session)', async () => {
    prisma.sellerProfile.findFirst.mockResolvedValue({ id: 'sp1', tenantId: 't1', userId: 'user1' });
    await service.remove('t1', 'admin1', 'emp1');
    expect(prisma.sellerProfile.update).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { isActive: false },
    });
  });
});
