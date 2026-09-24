import { Module } from '@nestjs/common';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { ExpiryAlertsService } from './expiry-alerts.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

@Module({
  imports: [SuppliersModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository, ExpiryAlertsService],
  exports: [ProductsService],
})
export class ProductsModule {}
