import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionLifecycleService],
})
export class SubscriptionsModule {}
