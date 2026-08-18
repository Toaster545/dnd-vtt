import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';
import { PlayerService } from './player.service';

@Controller('player')
@UseGuards(JwtGuard)
export class PlayerController {
  constructor(private player: PlayerService) {}

  @Get('bootstrap')
  bootstrap(
    @CurrentUser() user: RequestUser,
    @Query('campaignId') campaignId?: string,
    @Query('characterId') characterId?: string,
  ) {
    return this.player.bootstrap(user, { campaignId, characterId });
  }
}
