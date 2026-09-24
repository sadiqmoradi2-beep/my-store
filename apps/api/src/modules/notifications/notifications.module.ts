import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NOTIFICATION_DISPATCH_QUEUE } from '../../queue/queue.module';
import { LogChannelProvider } from './channels/log-channel.provider';
import { SMS_PROVIDER, WHATSAPP_PROVIDER } from './channels/notification-channel.provider';
import { NotificationDispatchProcessor } from './notification-dispatch.processor';
import { NotificationDispatchQueue } from './notification-dispatch.queue';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATION_DISPATCH_QUEUE })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatchQueue,
    NotificationDispatchProcessor,
    { provide: SMS_PROVIDER, useValue: new LogChannelProvider('SMS') },
    { provide: WHATSAPP_PROVIDER, useValue: new LogChannelProvider('WHATSAPP') },
  ],
  exports: [NotificationsService, NotificationDispatchQueue],
})
export class NotificationsModule {}
