import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from './employees.service';

const D = (v: number) => new Prisma.Decimal(v);

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
      providers: [EmployeesService, { provide: PrismaService, useValue: prisma }],
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

    const moduleRef = await Test.createTestingModule({
      providers: [EmployeesService, { provide: PrismaService, useValue: prisma }],
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
      providers: [EmployeesService, { provide: PrismaService, useValue: prisma }],
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
      providers: [EmployeesService, { provide: PrismaService, useValue: prisma }],
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
