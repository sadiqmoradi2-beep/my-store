import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../tenant-modules/module-access.service';
import { NotificationDispatchQueue } from '../notifications/notification-dispatch.queue';
import { notifyRoles } from '../notifications/notifications.service';

const REMINDER_ROLES = ['ADMIN'] as const;
const LOOKAHEAD_MS = 3 * 24 * 60 * 60 * 1000;

interface ExpiringSubscription {
  tenantId: string;
  endsAt: Date | null;
}

/** Daily subscription sweep: expiring-soon reminders + access cutoff (downgrade to FREE) after expiry */
@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly dispatchQueue: NotificationDispatchQueue,
  ) {}

  @Cron('0 6 * * *')
  async downgradeExpired() {
    const freePlan = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) return;

    const expired = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', endsAt: { lte: new Date() }, planId: { not: freePlan.id } },
      include: { plan: true },
    });

    for (const subscription of expired) {
      try {
        await this.downgrade(subscription.tenantId, subscription.plan.code, freePlan.id);
      } catch (error) {
        this.logger.error(`subscription downgrade failed for tenant ${subscription.tenantId}`, error as Error);
      }
    }
  }

  private async downgrade(tenantId: string, fromPlanCode: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE', freePlanId: string) {
    const startsAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { tenantId },
        data: {
          planId: freePlanId,
          status: 'ACTIVE',
          startsAt,
          endsAt: null,
          billingCycle: null,
          pendingPlanId: null,
          pendingBillingCycle: null,
          pendingRequestedAt: null,
          lastExpiryReminderAt: null,
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          tenantId,
          event: 'EXPIRED_DOWNGRADE',
          fromPlanCode,
          toPlanCode: 'FREE',
          billingCycle: null,
          startsAt,
          endsAt: null,
        },
      });
      await notifyRoles(tx, tenantId, [...REMINDER_ROLES], {
        type: 'SYSTEM',
        title: 'Your subscription plan has expired',
        body: 'Your paid plan has ended and the store has automatically reverted to the Free plan.',
        refType: 'subscription',
        refId: tenantId,
      });
    });
    this.moduleAccess.invalidate(tenantId);
  }

  @Cron('30 6 * * *')
  async remindExpiringSoon() {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const horizon = new Date(now.getTime() + LOOKAHEAD_MS);

    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        billingCycle: { not: null },
        endsAt: { gte: now, lte: horizon },
        OR: [{ lastExpiryReminderAt: null }, { lastExpiryReminderAt: { lt: dayStart } }],
      },
      select: { tenantId: true, endsAt: true },
    });

    for (const subscription of subscriptions) {
      try {
        await this.remind(subscription);
      } catch (error) {
        this.logger.error(`subscription reminder failed for tenant ${subscription.tenantId}`, error as Error);
      }
    }
  }

  private async remind(subscription: ExpiringSubscription) {
    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await notifyRoles(tx, subscription.tenantId, [...REMINDER_ROLES], {
        type: 'SUBSCRIPTION_EXPIRING',
        title: 'Your subscription is expiring soon',
        body: `Your current plan expires on ${subscription.endsAt?.toLocaleDateString('en-US')} — renew to avoid losing access.`,
        refType: 'subscription',
        refId: subscription.tenantId,
        channel: 'SMS',
      });
      await tx.subscription.update({
        where: { tenantId: subscription.tenantId },
        data: { lastExpiryReminderAt: new Date() },
      });
      return rows;
    });

    await this.dispatchQueue.enqueueMany(created.map((n) => n.id));
  }
}
