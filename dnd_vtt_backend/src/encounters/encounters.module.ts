import { Module } from '@nestjs/common';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { EncounterPresenceGateway } from './encounter-presence.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EncountersController],
  providers: [EncountersService, EncounterPresenceGateway],
})
export class EncountersModule {}
