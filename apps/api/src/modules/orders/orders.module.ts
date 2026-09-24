import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { SellersModule } from '../sellers/sellers.module';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [InventoryModule, SellersModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
