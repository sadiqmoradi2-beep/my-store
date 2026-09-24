import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatchQueue } from '../notifications/notification-dispatch.queue';
import { DebtRemindersService } from './debt-reminders.service';

const D = (v: number) => new Prisma.Decimal(v);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('DebtRemindersService.sendDueReminders', () => {
  let service: DebtRemindersService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let tx: Record<string, Record<string, jest.Mock>>;
  let dispatchQueue: { enqueueMany: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    tx = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
      notification: {
        createManyAndReturn: jest
          .fn()
          .mockImplementation(({ data }: { data: object[] }) =>
            data.map((d, i) => ({ id: `n${i}`, ...d })),
          ),
      },
      debt: { update: jest.fn() },
    };
    dispatchQueue = { enqueueMany: jest.fn() };
    prisma = {
      debt: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DebtRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationDispatchQueue, useValue: dispatchQueue },
      ],
    }).compile();
    service = moduleRef.get(DebtRemindersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries debts: due within the 24-hour horizon + no repeat based on lastReminderAt', async () => {
    await service.sendDueReminders();
    expect(prisma.debt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['OPEN', 'PARTIAL'] },
          dueDate: { lte: expect.any(Date) },
          OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: expect.any(Date) } }],
        }),
      }),
    );
  });

  it('overdue debt → title "Overdue" and label "Payable to"', async () => {
    prisma.debt.findMany.mockResolvedValue([
      {
        id: 'd1',
        tenantId: 't1',
        direction: 'PAYABLE',
        partyName: 'Supplier 1',
        amount: D(500),
        paidAmount: D(200),
        dueDate: new Date(Date.now() - DAY_MS),
      },
    ]);
    await service.sendDueReminders();
    const data = tx.notification.createManyAndReturn.mock.calls[0][0].data;
    expect(data[0].title).toContain('Overdue');
    expect(data[0].title).toContain('Payable to');
    expect(data[0].body).toBe('Remaining amount: 300');
    expect(tx.debt.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { lastReminderAt: expect.any(Date) },
    });
    expect(dispatchQueue.enqueueMany).toHaveBeenCalledWith(['n0']);
  });

  it('debt due soon → title "Due soon" and label "Receivable from"', async () => {
    prisma.debt.findMany.mockResolvedValue([
      {
        id: 'd2',
        tenantId: 't1',
        direction: 'RECEIVABLE',
        partyName: 'Customer 1',
        amount: D(200),
        paidAmount: D(0),
        dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    ]);
    await service.sendDueReminders();
    const data = tx.notification.createManyAndReturn.mock.calls[0][0].data;
    expect(data[0].title).toContain('Due soon');
    expect(data[0].title).toContain('Receivable from');
  });

  it('an error reminding about one debt does not block processing the rest', async () => {
    prisma.debt.findMany.mockResolvedValue([
      {
        id: 'd1',
        tenantId: 't1',
        direction: 'PAYABLE',
        partyName: 'Alpha',
        amount: D(100),
        paidAmount: D(0),
        dueDate: new Date(),
      },
      {
        id: 'd2',
        tenantId: 't1',
        direction: 'PAYABLE',
        partyName: 'Beta',
        amount: D(100),
        paidAmount: D(0),
        dueDate: new Date(),
      },
    ]);
    tx.user.findMany.mockRejectedValueOnce(new Error('db down'));
    await service.sendDueReminders();
    expect(dispatchQueue.enqueueMany).toHaveBeenCalledTimes(1);
  });
});
