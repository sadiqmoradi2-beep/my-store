import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService, RolesRepository],
  exports: [RolesService],
})
export class RolesModule {}
