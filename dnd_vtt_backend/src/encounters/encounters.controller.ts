import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

@Controller('encounters')
@UseGuards(JwtGuard)
export class EncountersController {
  constructor(private encounters: EncountersService) {}

  @Get()
  findAll(
    @Query('sessionId') sessionId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (sessionId) return this.encounters.findBySession(sessionId, user);
    return this.encounters.findAllForUser(user.id);
  }

  // Any authenticated user (not just the owning DM) can resolve a join code — a player owns no
  // encounters, so this is the one deliberate exception to the dm_id-scoped reads below.
  @Get('join/:code')
  findByJoinCode(@Param('code') code: string) {
    return this.encounters.findByJoinCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.findOne(id, user.id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateEncounterDto, @CurrentUser() user: RequestUser) {
    return this.encounters.create(user.id, dto);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.encounters.update(id, user.id, body);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.remove(id, user.id);
  }

  @Post(':id/start')
  @UseGuards(AdminGuard)
  start(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.start(id, user.id);
  }

  @Post(':id/stop')
  @UseGuards(AdminGuard)
  stop(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.stop(id, user.id);
  }

  @Post(':id/turn/next')
  @UseGuards(AdminGuard)
  nextTurn(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.nextTurn(id, user.id);
  }

  @Post(':id/turn/previous')
  @UseGuards(AdminGuard)
  previousTurn(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.previousTurn(id, user.id);
  }

  @Patch(':id/visibility')
  @UseGuards(AdminGuard)
  setVisibility(
    @Param('id') id: string,
    @Body() body: { visible: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.encounters.setVisibility(id, user.id, body.visible);
  }
}
