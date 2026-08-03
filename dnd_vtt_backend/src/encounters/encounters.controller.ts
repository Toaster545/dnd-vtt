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
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

// No AdminGuard — encounter ownership is scoped to the parent session's dm_id, checked inside
// EncountersService (see create there; the rest already key every lookup off dm_id).
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

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.findOne(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateEncounterDto, @CurrentUser() user: RequestUser) {
    return this.encounters.create(user.id, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.encounters.update(id, user.id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.remove(id, user.id);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.start(id, user.id);
  }

  @Post(':id/stop')
  stop(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.stop(id, user.id);
  }

  @Post(':id/turn/next')
  nextTurn(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.nextTurn(id, user.id);
  }

  @Post(':id/turn/previous')
  previousTurn(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.encounters.previousTurn(id, user.id);
  }

  @Patch(':id/visibility')
  setVisibility(
    @Param('id') id: string,
    @Body() body: { visible: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.encounters.setVisibility(id, user.id, body.visible);
  }
}
