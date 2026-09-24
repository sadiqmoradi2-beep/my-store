import { Module } from '@nestjs/common';
import { CashModule } from '../cash/cash.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DebtRemindersService } from './debt-reminders.service';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';

@Module({
  imports: [CashModule, NotificationsModule],
  controllers: [DebtsController],
  providers: [DebtsService, DebtRemindersService],
  exports: [DebtsService],
})
export class DebtsModule {}
