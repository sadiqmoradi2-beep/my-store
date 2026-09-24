import { Module } from '@nestjs/common';
import { CartsModule } from '../carts/carts.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [CartsModule, OrdersModule, PaymentsModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
