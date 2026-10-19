import { Module } from '@nestjs/common';
import { CashCorrectionsController } from './cash-corrections.controller';
import { CashCorrectionsService } from './cash-corrections.service';

@Module({
  controllers: [CashCorrectionsController],
  providers: [CashCorrectionsService],
})
export class CashCorrectionsModule {}
