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

  @Post('drafts')
  createDraft(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.createDraft(user.id, body);
  }

  @Patch(':id/draft')
  updateDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.updateDraft(id, user, body);
  }

  @Post(':id/complete')
  completeDraft(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.characters.completeDraft(id, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.update(id, user, body);
  }

  @Post(':id/grant-item')
  grantItem(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.grantItem(id, user, body);
  }

  @Post(':id/revoke-item')
  revokeItem(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.revokeItem(id, user, body);
  }

  @Post(':id/replicate-item')
  replicateItem(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.replicateItem(id, user, body);
  }

  @Post(':id/pact-weapon')
  updatePactWeapon(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.updatePactWeapon(id, user, body);
  }

  @Post(':id/grant-spell')
  grantSpell(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.grantSpell(id, user, body);
  }

  @Post(':id/revoke-spell')
  revokeSpell(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.revokeSpell(id, user, body);
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

  @Post(':id/life-rest')
  lifeRest(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.restoreLife(id, user, body);
  }

  // Self-serve Level-Up: a player applies the choices for a level the DM granted them (HP,
  // features, ASI/feat, spells) even on a DM-locked campaign copy. One-shot per level bump —
  // see CharactersService.applyLevelUp.
  @Post(':id/level-up')
  applyLevelUp(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characters.applyLevelUp(id, user, body);
  }

  @Patch(':id/concentration')
  endConcentration(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.characters.endConcentration(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.characters.remove(id, user.id);
  }
}
