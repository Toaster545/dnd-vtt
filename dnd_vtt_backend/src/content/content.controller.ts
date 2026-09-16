import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateMonsterDto } from './dto/create-monster.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateSpellDto } from './dto/create-spell.dto';
import { JwtGuard } from '../auth/jwt.guard';
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

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('sources') getSources() {
    return this.content.getSources();
  }

  @Get('classes') getClasses() {
    return this.content.getClasses();
  }
  @Get('classes/:index') getClass(@Param('index') i: string) {
    return this.content.getClass(i);
  }
  @Get('races') getRaces() {
    return this.content.getRaces();
  }
  @Get('races/:index') getRace(@Param('index') i: string) {
    return this.content.getRace(i);
  }
  @Get('backgrounds') getBackgrounds() {
    return this.content.getBackgrounds();
  }
  @Get('backgrounds/:index') getBackground(@Param('index') i: string) {
    return this.content.getBackground(i);
  }
  @Get('feats') getFeats() {
    return this.content.getFeats();
  }
  @Get('feats/:index') getFeat(@Param('index') i: string) {
    return this.content.getFeat(i);
  }

  // ── Monsters ──────────────────────────────────────────────────────────────────────────────
  // Reads require auth so custom-content merging knows who's asking; `campaignId` (optional)
  // merges in that campaign's DM's library alongside the static SRD set. `mine` must be
  // registered before `:index`, or Nest's routing would swallow it as an index param.
  @Get('monsters')
  @UseGuards(JwtGuard)
  getMonsters(
    @Query('campaignId') campaignId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.getMonsters(campaignId, user);
  }
  @Get('monsters/mine')
  @UseGuards(JwtGuard)
  listMyMonsters(@CurrentUser() user: RequestUser) {
    return this.content.listMine('monsters', user);
  }
  @Get('monsters/:index') getMonster(@Param('index') i: string) {
    return this.content.getMonster(i);
  }
  @Post('monsters')
  @UseGuards(JwtGuard)
  createMonster(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateMonsterDto,
  ) {
    return this.content.createCustom('monsters', user, { ...dto });
  }
  @Put('monsters/:index')
  @UseGuards(JwtGuard)
  updateMonster(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateMonsterDto,
  ) {
    return this.content.updateCustom('monsters', index, user, { ...dto });
  }
  @Delete('monsters/:index')
  @UseGuards(JwtGuard)
  deleteMonster(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.deleteCustom('monsters', index, user);
  }

  // ── Items ─────────────────────────────────────────────────────────────────────────────────
  @Get('items')
  @UseGuards(JwtGuard)
  getItems(
    @Query('campaignId') campaignId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.getItems(campaignId, user);
  }
  @Get('items/mine')
  @UseGuards(JwtGuard)
  listMyItems(@CurrentUser() user: RequestUser) {
    return this.content.listMine('items', user);
  }
  @Get('items/:index') getItem(@Param('index') i: string) {
    return this.content.getItem(i);
  }
  @Post('items')
  @UseGuards(JwtGuard)
  createItem(@CurrentUser() user: RequestUser, @Body() dto: CreateItemDto) {
    return this.content.createCustom('items', user, { ...dto });
  }
  @Put('items/:index')
  @UseGuards(JwtGuard)
  updateItem(
    @Param('index') index: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateItemDto,
  ) {
    return this.content.updateCustom('items', index, user, { ...dto });
  }
  @Delete('items/:index')
  @UseGuards(JwtGuard)
  deleteItem(@Param('index') index: string, @CurrentUser() user: RequestUser) {
    return this.content.deleteCustom('items', index, user);
  }

  // ── Spells ────────────────────────────────────────────────────────────────────────────────
  @Get('spell-lists') getSpellLists() {
    return this.content.getSpellLists();
  }

  @Get('spells')
  @UseGuards(JwtGuard)
  getSpells(
    @Query('campaignId') campaignId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.getSpells(campaignId, user);
  }
  @Get('spells/mine')
  @UseGuards(JwtGuard)
  listMySpells(@CurrentUser() user: RequestUser) {
    return this.content.listMine('spells', user);
  }
  @Get('spells/:index') getSpell(@Param('index') i: string) {
    return this.content.getSpell(i);
  }
  @Post('spells')
  @UseGuards(JwtGuard)
  createSpell(@CurrentUser() user: RequestUser, @Body() dto: CreateSpellDto) {
    return this.content.createCustom('spells', user, withSpellDefaults(dto));
  }
  @Put('spells/:index')
  @UseGuards(JwtGuard)
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
  @UseGuards(JwtGuard)
  deleteSpell(@Param('index') index: string, @CurrentUser() user: RequestUser) {
    return this.content.deleteCustom('spells', index, user);
  }
}
