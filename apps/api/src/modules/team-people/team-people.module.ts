import { Module } from '@nestjs/common';
import { TeamPeopleController } from './team-people.controller';
import { TeamPeopleService } from './team-people.service';

@Module({
  controllers: [TeamPeopleController],
  providers: [TeamPeopleService],
})
export class TeamPeopleModule {}
