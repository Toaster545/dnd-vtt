import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CharactersService } from './characters.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';
import { ValidateOnlyPipe } from '../common/validate-only.pipe';
import { CharacterBodyDto } from './dto/character-body.dto';
import { GrantItemDto, RevokeItemDto } from './dto/item-grant.dto';
import { InventoryOperationDto } from './dto/inventory-operation.dto';
import { CompleteRestDto } from './dto/complete-rest.dto';
import { LifeRestDto, SpellRestDto } from './dto/rest-type.dto';
import { PactWeaponDto } from './dto/pact-weapon.dto';
import { GrantSpellDto, RevokeSpellDto } from './dto/spell-grant.dto';
import { CastSpellDto } from './dto/cast-spell.dto';

// The character body is the open-ended `data` blob; only its typed fields are validated and the
// rest passes through (see ValidateOnlyPipe for why this isn't a plain DTO parameter).
const characterBody = () => Body(new ValidateOnlyPipe(CharacterBodyDto));

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

  // The client crops and downscales before uploading, so 2 MB is plenty for a token-sized image.
  @Post('portrait')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  uploadPortrait(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.characters.uploadPortrait(user.id, file);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @characterBody() body: Record<string, unknown>,
  ) {
    return this.characters.create(user.id, body);
  }

  @Post('drafts')
  createDraft(
    @CurrentUser() user: RequestUser,
    @characterBody() body: Record<string, unknown>,
  ) {
    return this.characters.createDraft(user.id, body);
  }

  @Patch(':id/draft')
  updateDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @characterBody() body: Record<string, unknown>,
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
    @characterBody() body: Record<string, unknown>,
  ) {
    return this.characters.update(id, user, body);
  }

  @Post(':id/grant-item')
  grantItem(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: GrantItemDto,
  ) {
    return this.characters.grantItem(id, user, { ...body });
  }

  @Post(':id/revoke-item')
  revokeItem(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: RevokeItemDto,
  ) {
    return this.characters.revokeItem(id, user, { ...body });
  }

  @Get(':id/inventory-options')
  inventoryOptions(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.characters.inventoryOptions(id, user);
  }

  @Post(':id/inventory/:instanceId')
  inventoryOperation(
    @Param('id') id: string,
    @Param('instanceId') instanceId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: InventoryOperationDto,
  ) {
    return this.characters.inventoryOperation(id, instanceId, user, {
      ...body,
    });
  }

  @Post(':id/rest')
  completeRest(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CompleteRestDto,
  ) {
    return this.characters.completeRest(id, user, { ...body });
  }

  @Post(':id/replicate-item')
  replicateItem(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.characters.replicateItem(id, user, {});
  }

  @Post(':id/pact-weapon')
  updatePactWeapon(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: PactWeaponDto,
  ) {
    return this.characters.updatePactWeapon(id, user, { ...body });
  }

  @Post(':id/grant-spell')
  grantSpell(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: GrantSpellDto,
  ) {
    return this.characters.grantSpell(id, user, { ...body });
  }

  @Post(':id/revoke-spell')
  revokeSpell(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: RevokeSpellDto,
  ) {
    return this.characters.revokeSpell(id, user, { ...body });
  }

  @Post(':id/cast')
  castSpell(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CastSpellDto,
  ) {
    return this.characters.castSpell(id, user, { ...body });
  }

  @Post(':id/spell-rest')
  restoreSpellcasting(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: SpellRestDto,
  ) {
    return this.characters.restoreSpellcasting(id, user, { ...body });
  }

  @Post(':id/life-rest')
  lifeRest(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: LifeRestDto,
  ) {
    return this.characters.restoreLife(id, user, { ...body });
  }

  // Self-serve Level-Up: a player applies the choices for a level the DM granted them (HP,
  // features, ASI/feat, spells) even on a DM-locked campaign copy. One-shot per level bump —
  // see CharactersService.applyLevelUp.
  @Post(':id/level-up')
  applyLevelUp(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @characterBody() body: Record<string, unknown>,
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
