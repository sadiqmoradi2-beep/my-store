import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { LowStockAlertsService } from './low-stock-alerts.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository, LowStockAlertsService],
  exports: [InventoryService],
})
export class InventoryModule {}
