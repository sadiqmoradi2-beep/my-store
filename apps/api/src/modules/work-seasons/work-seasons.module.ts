import { Module } from '@nestjs/common';
import { WorkSeasonsController } from './work-seasons.controller';
import { WorkSeasonsService } from './work-seasons.service';

@Module({
  controllers: [WorkSeasonsController],
  providers: [WorkSeasonsService],
})
export class WorkSeasonsModule {}
