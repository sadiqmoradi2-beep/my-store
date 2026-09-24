import { Module } from '@nestjs/common';
import { CashModule } from '../cash/cash.module';
import { DebtsModule } from '../debts/debts.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CashModule, DebtsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
