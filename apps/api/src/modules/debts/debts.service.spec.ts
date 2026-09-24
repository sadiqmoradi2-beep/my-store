import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createDebt, DebtsService } from './debts.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('DebtsService.pay', () => {
  let service: DebtsService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;

  const debt = {
    id: 'debt1',
    tenantId: 't1',
    direction: 'PAYABLE' as const,
    partyName: 'Supplier 1',
    amount: D(500),
    paidAmount: D(200),
    payments: [],
  };

  beforeEach(async () => {
    tx = {
      debtPayment: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'pay1', ...data })),
      },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue({ balance: D(1000), isActive: true }),
        update: jest.fn(),
      },
      cashTransaction: { create: jest.fn() },
      debt: { update: jest.fn() },
    };
    prisma = {
      debt: { findFirst: jest.fn().mockResolvedValue({ ...debt }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [DebtsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DebtsService);
  });

  it('payment greater than the remaining balance → 422 and nothing is recorded', async () => {
    await expect(service.pay('t1', 'u1', 'debt1', { amount: 400 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(tx.debtPayment.create).not.toHaveBeenCalled();
  });

  it('partial payment without a register → no register effect and PARTIAL status', async () => {
    await service.pay('t1', 'u1', 'debt1', { amount: 100 });
    expect(tx.cashTransaction.create).not.toHaveBeenCalled();
    const data = tx.debt.update.mock.calls[0][0].data;
    expect(data.paidAmount.toString()).toBe('300');
    expect(data.status).toBe('PARTIAL');
  });

  it('full PAYABLE settlement with a register → EXPENSE transaction and SETTLED status', async () => {
    await service.pay('t1', 'u1', 'debt1', { amount: 300, registerId: 'reg1' });
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.type).toBe('EXPENSE');
    const data = tx.debt.update.mock.calls[0][0].data;
    expect(data.status).toBe('SETTLED');
  });

  it('collecting a RECEIVABLE with a register → INCOME transaction', async () => {
    prisma.debt.findFirst.mockResolvedValue({ ...debt, direction: 'RECEIVABLE' });
    await service.pay('t1', 'u1', 'debt1', { amount: 100, registerId: 'reg1' });
    const cashData = tx.cashTransaction.create.mock.calls[0][0].data;
    expect(cashData.type).toBe('INCOME');
  });

  it('record not found → 404', async () => {
    prisma.debt.findFirst.mockResolvedValue(null);
    await expect(
      service.pay('t1', 'u1', 'missing', { amount: 100 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DebtsService.remove', () => {
  let service: DebtsService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      debt: {
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DebtsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DebtsService);
  });

  it('record with no payments → gets deleted', async () => {
    prisma.debt.findFirst.mockResolvedValue({
      id: 'debt1',
      paidAmount: D(0),
      amount: D(100),
      payments: [],
    });
    await service.remove('t1', 'debt1');
    expect(prisma.debt.delete).toHaveBeenCalledWith({ where: { id: 'debt1' } });
  });

  it('record that has a payment → 422 and no deletion', async () => {
    prisma.debt.findFirst.mockResolvedValue({
      id: 'debt1',
      paidAmount: D(50),
      amount: D(100),
      payments: [],
    });
    await expect(service.remove('t1', 'debt1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.debt.delete).not.toHaveBeenCalled();
  });
});

describe('DebtsService.create', () => {
  let service: DebtsService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      debt: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'debt1', ...data })) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp1', fullName: 'Employee 1' }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DebtsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DebtsService);
  });

  it('supplierId and employeeId at the same time → 400', async () => {
    await expect(
      service.create('t1', 'u1', {
        direction: 'RECEIVABLE',
        supplierId: 's1',
        employeeId: 'emp1',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.debt.create).not.toHaveBeenCalled();
  });

  it('advance/loan to an employee (RECEIVABLE) → the name is filled from Employee.fullName', async () => {
    await service.create('t1', 'u1', {
      direction: 'RECEIVABLE',
      employeeId: 'emp1',
      amount: 100,
    });
    const data = prisma.debt.create.mock.calls[0][0].data;
    expect(data.partyName).toBe('Employee 1');
    expect(data.employeeId).toBe('emp1');
  });

  it('unpaid salary to an employee (PAYABLE) → allowed (unlike customer/supplier, it has no direction lock)', async () => {
    await service.create('t1', 'u1', {
      direction: 'PAYABLE',
      employeeId: 'emp1',
      amount: 100,
    });
    const data = prisma.debt.create.mock.calls[0][0].data;
    expect(data.direction).toBe('PAYABLE');
    expect(data.employeeId).toBe('emp1');
  });
});

describe('DebtsService.byEmployee', () => {
  let service: DebtsService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp1', fullName: 'Employee 1' }) },
      debt: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DebtsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DebtsService);
  });

  it('employee not found → 404', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(service.byEmployee('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('employee found → the ledger is returned with the employee name', async () => {
    const result = await service.byEmployee('t1', 'emp1');
    expect(result.party).toEqual({ id: 'emp1', name: 'Employee 1' });
    expect(prisma.debt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', employeeId: 'emp1' } }),
    );
  });
});

describe('createDebt', () => {
  it('creates a debt/receivable record inside the transaction with the given fields', async () => {
    const tx = { debt: { create: jest.fn().mockResolvedValue({ id: 'debt1' }) } };
    await createDebt(tx as never, {
      tenantId: 't1',
      direction: 'PAYABLE',
      partyName: 'Supplier 1',
      supplierId: 'sup1',
      amount: D(50),
      referenceType: 'purchase',
      referenceId: 'purch-1',
      notes: 'Remaining balance for purchase #1',
      createdById: 'u1',
    });
    expect(tx.debt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        direction: 'PAYABLE',
        partyName: 'Supplier 1',
        supplierId: 'sup1',
        amount: D(50),
        referenceType: 'purchase',
        referenceId: 'purch-1',
        createdById: 'u1',
      }),
    });
  });
});
