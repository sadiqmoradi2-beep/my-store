import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatchQueue } from '../notifications/notification-dispatch.queue';
import { notifyRoles } from '../notifications/notifications.service';

const REMINDER_ROLES = ['ADMIN', 'BRANCH_MANAGER'] as const;
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

interface DueDebt {
  id: string;
  tenantId: string;
  direction: 'RECEIVABLE' | 'PAYABLE';
  partyName: string;
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date | null;
}

/** Daily reminder for due/upcoming debts — in-app + SMS (via the dispatch queue) */
@Injectable()
export class DebtRemindersService {
  private readonly logger = new Logger(DebtRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchQueue: NotificationDispatchQueue,
  ) {}

  @Cron('0 7 * * *')
  async sendDueReminders() {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const horizon = new Date(now.getTime() + LOOKAHEAD_MS);

    const dueDebts = await this.prisma.debt.findMany({
      where: {
        status: { in: ['OPEN', 'PARTIAL'] },
        dueDate: { lte: horizon },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: dayStart } }],
      },
      select: {
        id: true,
        tenantId: true,
        direction: true,
        partyName: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
      },
    });

    for (const debt of dueDebts) {
      try {
        await this.remind(debt);
      } catch (error) {
        this.logger.error(`debt reminder failed for ${debt.id}`, error as Error);
      }
    }
  }

  private async remind(debt: DueDebt) {
    const remaining = debt.amount.sub(debt.paidAmount).toString();
    const overdue = debt.dueDate !== null && debt.dueDate.getTime() < Date.now();
    const label = debt.direction === 'RECEIVABLE' ? 'Receivable from' : 'Payable to';

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await notifyRoles(tx, debt.tenantId, [...REMINDER_ROLES], {
        type: 'DEBT_DUE',
        title: `${overdue ? 'Overdue' : 'Due soon'}: ${label} ${debt.partyName}`,
        body: `Remaining amount: ${remaining}`,
        refType: 'debt',
        refId: debt.id,
        channel: 'SMS',
      });
      await tx.debt.update({ where: { id: debt.id }, data: { lastReminderAt: new Date() } });
      return rows;
    });

    await this.dispatchQueue.enqueueMany(created.map((n) => n.id));
  }
}
