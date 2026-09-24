import { Module } from '@nestjs/common';
import { PurchaseReturnsController } from './purchase-returns.controller';
import { PurchaseReturnsService } from './purchase-returns.service';

@Module({
  controllers: [PurchaseReturnsController],
  providers: [PurchaseReturnsService],
})
export class ReturnsModule {}
