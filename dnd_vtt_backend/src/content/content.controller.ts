import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContentService } from './content.service';
import { CreateMonsterDto } from './dto/create-monster.dto';
import { CreateItemDto, CreateItemsBulkDto } from './dto/create-item.dto';
import { CreateSpellDto } from './dto/create-spell.dto';
import { SetItemImageOverrideDto } from './dto/set-item-image-override.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';

// Homebrew spells rarely bother filling in every mechanics/source field the SRD data has — these
// fill the gaps so any code that assumes e.g. `spell.source.book` or `spell.mechanics.damage_types`
// always exists (filtering, display) never sees `undefined` for a DM-authored spell.
const DEFAULT_SPELL_MECHANICS = {
  saving_throws: [] as string[],
  ability_checks: [] as string[],
  damage_types: [] as string[],
  conditions: [] as string[],
  affects_creature_types: [] as string[],
  grants_damage_immunities: [] as string[],
  grants_damage_resistances: [] as string[],
  grants_damage_vulnerabilities: [] as string[],
  grants_condition_immunities: [] as string[],
  area_tags: [] as string[],
  misc_tags: [] as string[],
};

const DEFAULT_SPELL_SOURCE = {
  book: 'Homebrew',
  edition: 0,
  code: '',
  page: 0,
  srd_5_2_1: false,
  rules_text: 'reference-only' as const,
};

function withSpellDefaults(dto: CreateSpellDto) {
  return {
    ...dto,
    mechanics: { ...DEFAULT_SPELL_MECHANICS, ...dto.mechanics },
    source: { ...DEFAULT_SPELL_SOURCE, ...dto.source },
  };
}

// Guarded by default like every other controller; the static game-content reads below are
// opted out with @Public().
@Controller('content')
@UseGuards(JwtGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get('sources')
  getSources() {
    return this.content.getSources();
  }

  @Public()
  @Get('icons')
  getIconLibrary() {
    return this.content.getIconLibrary();
  }

  @Public()
  @Get('classes')
  getClasses() {
    return this.content.getClasses();
  }
  @Public()
  @Get('classes/:index')
  getClass(@Param('index') i: string) {
    return this.content.getClass(i);
  }
  @Public()
  @Get('races')
  getRaces() {
    return this.content.getRaces();
  }
  @Public()
  @Get('races/:index')
  getRace(@Param('index') i: string) {
    return this.content.getRace(i);
  }
  @Public()
  @Get('backgrounds')
  getBackgrounds() {
    return this.content.getBackgrounds();
  }
  @Public()
  @Get('backgrounds/:index')
  getBackground(@Param('index') i: string) {
    return this.content.getBackground(i);
  }
  @Public()
  @Get('feats')
  getFeats() {
    return this.content.getFeats();
  }
  @Public()
  @Get('feats/:index')
  getFeat(@Param('index') i: string) {
    return this.content.getFeat(i);
  }

  // ── Monsters ──────────────────────────────────────────────────────────────────────────────
  // Reads require auth so custom-content merging knows who's asking; `campaignId` (optional)
  // merges in that campaign's DM's library alongside the static SRD set. `mine` must be
  // registered before `:index`, or Nest's routing would swallow it as an index param.
  @Get('monsters')
  getMonsters(
    @Query('campaignId') campaignId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.getMonsters(campaignId, user);
  }
  @Get('monsters/mine')
  listMyMonsters(@CurrentUser() user: RequestUser) {
    return this.content.listMine('monsters', user);
  }
  @Public()
  @Get('monsters/:index')
  getMonster(@Param('index') i: string) {
    return this.content.getMonster(i);
  }
  @Post('monsters')
  createMonster(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateMonsterDto,
  ) {
    return this.content.createCustom('monsters', user, { ...dto });
  }
  @Put('monsters/:index')
  updateMonster(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateMonsterDto,
  ) {
    return this.content.updateCustom('monsters', index, user, { ...dto });
  }
  @Delete('monsters/:index')
  deleteMonster(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.deleteCustom('monsters', index, user);
  }

  // ── Items ─────────────────────────────────────────────────────────────────────────────────
  @Get('items')
  getItems(
    @Query('campaignId') campaignId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.getItems(campaignId, user);
  }
  @Get('items/mine')
  listMyItems(@CurrentUser() user: RequestUser) {
    return this.content.listMine('items', user);
  }
  @Public()
  @Get('items/:index')
  getItem(@Param('index') i: string) {
    return this.content.getItem(i);
  }
  @Post('items')
  createItem(@CurrentUser() user: RequestUser, @Body() dto: CreateItemDto) {
    return this.content.createCustom('items', user, { ...dto });
  }
  // Bulk JSON import — body is `{ "items": [...] }`, each entry validated like a single
  // CreateItemDto.
  @Post('items/bulk')
  createItemsBulk(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateItemsBulkDto,
  ) {
    return this.content.createCustomBulk(
      'items',
      user,
      dto.items.map((item) => ({ ...item })),
    );
  }
  @Put('items/:index')
  updateItem(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateItemDto,
  ) {
    return this.content.updateCustom('items', index, user, { ...dto });
  }
  @Delete('items/:index')
  deleteItem(@Param('index') index: string, @CurrentUser() user: RequestUser) {
    return this.content.deleteCustom('items', index, user);
  }
  @Post('items/:index/image')
  @UseInterceptors(FileInterceptor('file'))
  uploadItemImage(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.content.uploadItemImage(index, user, file);
  }
  // Lets a DM swap an official SRD item's picture (e.g. a better icon-library pick) without
  // forking the whole item into their own custom library — see item_image_overrides.
  @Put('items/:index/image-override')
  setItemImageOverride(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SetItemImageOverrideDto,
  ) {
    return this.content.setItemImageOverride(index, user, dto.image_url);
  }
  @Delete('items/:index/image-override')
  clearItemImageOverride(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.clearItemImageOverride(index, user);
  }

  // ── Spells ────────────────────────────────────────────────────────────────────────────────
  @Public()
  @Get('spell-lists')
  getSpellLists() {
    return this.content.getSpellLists();
  }

  @Get('spells')
  getSpells(
    @Query('campaignId') campaignId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.getSpells(campaignId, user);
  }
  @Get('spells/mine')
  listMySpells(@CurrentUser() user: RequestUser) {
    return this.content.listMine('spells', user);
  }
  @Public()
  @Get('spells/:index')
  getSpell(@Param('index') i: string) {
    return this.content.getSpell(i);
  }
  @Post('spells')
  createSpell(@CurrentUser() user: RequestUser, @Body() dto: CreateSpellDto) {
    return this.content.createCustom('spells', user, withSpellDefaults(dto));
  }
  @Put('spells/:index')
  updateSpell(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSpellDto,
  ) {
    return this.content.updateCustom(
      'spells',
      index,
      user,
      withSpellDefaults(dto),
    );
  }
  @Delete('spells/:index')
  deleteSpell(@Param('index') index: string, @CurrentUser() user: RequestUser) {
    return this.content.deleteCustom('spells', index, user);
  }
}
