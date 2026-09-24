import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const NOTIFICATION_DISPATCH_QUEUE = 'notification-dispatch';

/**
 * Shared BullMQ→Redis connection configuration for the whole app. The queues
 * themselves are registered individually by each domain module (e.g.
 * NotificationsModule) via BullModule.registerQueue.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url')! },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
