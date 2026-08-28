import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { AuthModule } from '../auth/auth.module';
import { EncountersModule } from '../encounters/encounters.module';

@Module({
  imports: [AuthModule, EncountersModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
