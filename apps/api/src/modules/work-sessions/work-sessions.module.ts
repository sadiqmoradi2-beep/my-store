import { Module } from '@nestjs/common';
import { WorkSessionsController } from './work-sessions.controller';
import { WorkSessionsService } from './work-sessions.service';

@Module({
  controllers: [WorkSessionsController],
  providers: [WorkSessionsService],
  exports: [WorkSessionsService],
})
export class WorkSessionsModule {}
