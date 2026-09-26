import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [SalesModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
