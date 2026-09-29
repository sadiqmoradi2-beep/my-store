import { Module } from '@nestjs/common';
import { CashModule } from '../cash/cash.module';
import { SellersModule } from '../sellers/sellers.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [CashModule, SellersModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
