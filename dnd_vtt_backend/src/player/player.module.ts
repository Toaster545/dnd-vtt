import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [AuthModule, CampaignsModule],
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
