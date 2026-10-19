import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CashModule } from '../cash/cash.module';
import { SellersModule } from '../sellers/sellers.module';
import { UsersModule } from '../users/users.module';
import { WorkSessionsModule } from '../work-sessions/work-sessions.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { WorkIntervalsController } from './work-intervals.controller';
import { WorkIntervalsService } from './work-intervals.service';

@Module({
  imports: [CashModule, SellersModule, AuthModule, UsersModule, WorkSessionsModule],
  controllers: [EmployeesController, WorkIntervalsController],
  providers: [EmployeesService, WorkIntervalsService],
})
export class EmployeesModule {}
