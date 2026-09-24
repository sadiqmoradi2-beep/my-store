import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CashModule } from '../cash/cash.module';
import { DebtsModule } from '../debts/debts.module';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [InventoryModule, CashModule, DebtsModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
