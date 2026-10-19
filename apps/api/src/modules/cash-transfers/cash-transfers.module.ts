import { Module } from '@nestjs/common';
import { CashTransfersController } from './cash-transfers.controller';
import { CashTransfersService } from './cash-transfers.service';

@Module({
  controllers: [CashTransfersController],
  providers: [CashTransfersService],
})
export class CashTransfersModule {}
