import { Module } from '@nestjs/common';
import { BackupsModule } from '../backups/backups.module';
import { TenantsController } from './tenants.controller';
import { TenantsRepository } from './tenants.repository';
import { TenantsService } from './tenants.service';

@Module({
  imports: [BackupsModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService],
})
export class TenantsModule {}
