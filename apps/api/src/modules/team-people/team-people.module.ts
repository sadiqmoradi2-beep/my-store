import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamPeopleController } from './team-people.controller';
import { TeamPeopleService } from './team-people.service';
import { TeamPersonAccountService } from './team-person-account.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamPeopleController],
  providers: [TeamPeopleService, TeamPersonAccountService],
})
export class TeamPeopleModule {}
