import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CharactersService } from './characters.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

@Controller('characters')
@UseGuards(JwtGuard)
export class CharactersController {
  constructor(private characters: CharactersService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.characters.findAllForUser(user.id);
  }

  // Must come before @Get(':id') — otherwise Nest/Express would match "copies" as an :id.
  @Get('copies')
  findCopies(@CurrentUser() user: RequestUser) {
    return this.characters.findCampaignCopiesForUser(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.characters.findOneReadable(id, user);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.create(user.id, body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.update(id, user, body);
  }

  @Post(':id/cast')
  castSpell(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.castSpell(id, user, body);
  }

  @Post(':id/spell-rest')
  restoreSpellcasting(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.restoreSpellcasting(id, user, body);
  }

  @Patch(':id/concentration')
  endConcentration(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.characters.endConcentration(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.characters.remove(id, user.id);
  }
}
