import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATION_DISPATCH_QUEUE } from '../../queue/queue.module';

export interface NotificationDispatchJob {
  notificationId: string;
}

/** Lightweight producer on the dispatch queue — domains (e.g. debt reminders) use this instead of raw BullMQ */
@Injectable()
export class NotificationDispatchQueue {
  constructor(
    @InjectQueue(NOTIFICATION_DISPATCH_QUEUE) private readonly queue: Queue<NotificationDispatchJob>,
  ) {}

  async enqueue(notificationId: string): Promise<void> {
    await this.queue.add(
      'dispatch',
      { notificationId },
      { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 500, removeOnFail: 1000 },
    );
  }

  async enqueueMany(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;
    await this.queue.addBulk(
      notificationIds.map((notificationId) => ({
        name: 'dispatch',
        data: { notificationId },
        opts: {
          attempts: 5,
          backoff: { type: 'exponential' as const, delay: 2000 },
          removeOnComplete: 500,
          removeOnFail: 1000,
        },
      })),
    );
  }
}
