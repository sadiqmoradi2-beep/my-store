import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_DISPATCH_QUEUE } from '../../queue/queue.module';
import {
  NotificationChannelProvider,
  SMS_PROVIDER,
  WHATSAPP_PROVIDER,
} from './channels/notification-channel.provider';
import { NotificationDispatchJob } from './notification-dispatch.queue';

/** Queue worker — performs the actual send to the external channel (SMS/WhatsApp) and records the result on the Notification record */
@Processor(NOTIFICATION_DISPATCH_QUEUE)
export class NotificationDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: NotificationChannelProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsappProvider: NotificationChannelProvider,
  ) {
    super();
  }

  async process(job: Job<NotificationDispatchJob>): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { user: { select: { phone: true, fullName: true } } },
    });
    if (!notification || notification.dispatchStatus === 'SENT') return;
    if (!notification.user.phone) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { dispatchStatus: 'FAILED', lastError: 'User has no registered phone number' },
      });
      return;
    }

    const provider = notification.channel === 'WHATSAPP' ? this.whatsappProvider : this.smsProvider;
    try {
      await provider.send({
        to: notification.user.phone,
        title: notification.title,
        body: notification.body ?? undefined,
      });
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          dispatchStatus: 'SENT',
          dispatchedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { attempts: { increment: 1 }, lastError: (error as Error).message },
      });
      throw error; // BullMQ retries according to the configured backoff
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotificationDispatchJob>) {
    const attemptsAllowed = job.opts.attempts ?? 1;
    if (job.attemptsMade < attemptsAllowed) return; // another attempt is on the way
    this.logger.warn(`dispatch permanently failed for notification ${job.data.notificationId}`);
    await this.prisma.notification.update({
      where: { id: job.data.notificationId },
      data: { dispatchStatus: 'FAILED' },
    });
  }
}
