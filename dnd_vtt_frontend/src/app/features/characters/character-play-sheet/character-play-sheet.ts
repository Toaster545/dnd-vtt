import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ContentService, DndClass, DndRace, DndBackground, DndItem, DndSpell, DndFeat, DndMonster,
  DndContentSource, Subclass, TraitGrant,
} from '../../../core/services/content.service';
import { ItemFormComponent } from '../../create-content/items/item-form/item-form';
import { ItemService } from '../../../core/services/item.service';
import {
  CharacterService, SpellCastCommand,
} from '../../../core/services/character.service';
import { CharacterStatsService } from '../../../core/services/character-stats.service';
import { CharacterActionsService, CharacterAction } from '../../../core/services/character-actions.service';
import {
  Character, ABILITIES, ABILITY_SHORT, SKILLS, EquipmentEntry, Currency,
  abilityModifier, proficiencyBonus,
} from '../../../core/models/character.model';
import { adjustCurrency, CURRENCY_ORDER } from '../../../core/utils/currency';
import { normalizeAvatarRecipe, portraitDataUri, portraitSource } from '../../../core/utils/avatar';
import { AvatarRecipeV1 } from '../../../core/models/avatar.model';
import { AvatarCreatorDialogComponent } from '../../../shared/avatar-creator-dialog/avatar-creator-dialog';
import { reachableGrants, resolveCharacterFeatPicks } from '../../../core/utils/character-effects';
import { characterContentEnabled } from '../../../core/utils/content-sources';
import { resolveBackgroundOriginFeat } from '../../../core/utils/background-origin-feat';
import {
  describeSpellUpcast, isSpellAttackAction, resolveSpellAttackDamage,
  resolveSpellcasting, ResolvedSpellOrigin, ResolvedSpellSlotPool, ResolvedSpellCategory,
  SpellUpcastEffect,
} from '../../../core/utils/spellcasting';
import { ConfirmService } from '../../../shared/confirm.service';
import { SwipeTabsDirective } from '../../../shared/directives/swipe-tabs.directive';

function toIndex(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

interface ResolvedClass {
  name: string;
  data: DndClass;
  level: number;
  subclassName: string;
  subclass: Subclass | null;
  choices: Record<string, string[]>;
}

interface DisplayFeature {
  source: string;
  name: string;
  detail?: string;
}

interface ActiveCompanion {
  monster: DndMonster;
  source: string;
  detail?: string;
}

interface DisplaySpell {
  spell: DndSpell;
  origins: ResolvedSpellOrigin[];
  origin: ResolvedSpellOrigin;
  category: ResolvedSpellCategory;
}

interface CastingMethod {
  key: string;
  label: string;
  detail: string;
  command: SpellCastCommand;
  available: boolean;
  upcast?: SpellUpcastEffect;
}

// Shared shape for a castable spell paired with the source it's cast from — used both for
// spells that make an attack roll and spells that force a saving throw.
interface DisplaySpellRoll {
  spell: DndSpell;
  origin: ResolvedSpellOrigin;
}

interface SpellFilters {
  search: string;
  level: string;
  school: string;
  source: string;
  castingTime: string;
  ritual: boolean;
  concentration: boolean;
  prepared: string;
}

interface DescriptionSegment { text: string; bold: boolean }

type Tab = 'stats' | 'actions' | 'inventory' | 'spells';
const TAB_ORDER: Tab[] = ['stats', 'actions', 'inventory', 'spells'];

@Component({
  selector: 'app-character-play-sheet',
  imports: [FormsModule, MatIconModule, MatTooltipModule, NgTemplateOutlet, ItemFormComponent, SwipeTabsDirective],
  templateUrl: './character-play-sheet.html',
  styleUrl: './character-play-sheet.scss',
})
export class CharacterPlaySheetComponent {
  private content        = inject(ContentService);
  private itemService    = inject(ItemService);
  private characterService = inject(CharacterService);
  private statsService    = inject(CharacterStatsService);
  private actionsService  = inject(CharacterActionsService);
  private confirm         = inject(ConfirmService);
  private dialog          = inject(MatDialog);

  readonly character = input.required<Character>();
  // Set by DM-facing hosts (dm-campaign-hub, dm-campaign-session, dm-encounter-play) when the
  // sheet is opened for a party member rather than the viewer's own character — gates the
  // "Give Item" control, which calls a DM-only backend endpoint.
  readonly isDm       = input(false);
  // Set by encounter-play hosts (dm-encounter-play, the battle-map sidebar) where the viewer
  // already knows whose sheet this is — hides the "Level X Race · Class · Background" meta line
  // to keep the header tight next to the map.
  readonly compact    = input(false);
  readonly saved      = output<Character>();

  readonly abilities     = ABILITIES;
  readonly abilityShort  = ABILITY_SHORT;
  readonly skillList     = Object.keys(SKILLS);
  readonly skillAbility  = SKILLS;

  activeTab   = signal<Tab>('stats');
  // Swipe left/right (touch only, see appSwipeTabs) steps through the tabs in display order;
  // clamped rather than wrapping so a swipe past either end is simply a no-op.
  swipeTab(dir: 1 | -1) {
    const idx = TAB_ORDER.indexOf(this.activeTab());
    const next = Math.min(TAB_ORDER.length - 1, Math.max(0, idx + dir));
    this.activeTab.set(TAB_ORDER[next]);
  }
  loading     = signal(true);
  persisting  = signal(false);
  spellFiltersOpen = signal(false);
  castDialogSpell = signal<DisplaySpell | null>(null);
  pendingCastMethod = signal<CastingMethod | null>(null);
  castError = signal('');
  castNotice = signal('');
  replacingConcentration = signal(false);
  readonly spellFilters = signal<SpellFilters>({
    search: '', level: '', school: '', source: '', castingTime: '', ritual: false,
    concentration: false, prepared: '',
  });

  showGrantItemDialog    = signal(false);
  grantItemSearch        = signal('');
  grantItemQuantity      = signal(1);
  grantItemCreatingCustom = signal(false);
  grantItemBusy          = signal(false);
  grantItemError         = signal('');
  grantItemNotice        = signal('');
  replicateItemBusy      = signal(false);
  replicateItemError     = signal('');
  pactWeaponSelection    = signal('');
  pactWeaponBusy         = signal(false);
  pactWeaponError        = signal('');

  showGrantSpellDialog = signal(false);
  grantSpellSearch     = signal('');
  grantSpellBusy       = signal(false);
  grantSpellError      = signal('');
  grantSpellNotice     = signal('');

  // Short-rest dialog state
  showShortRestDialog = signal(false);
  shortRestHitDice = signal<number>(0);
  shortRestHealed = signal<number>(0);
  shortRestError = signal('');
  shortRestBusy = signal(false);

  hpAdjustAmount  = signal<number>(0);
  currencyOrder   = CURRENCY_ORDER;
  currencyAdjustAmounts = signal<Record<keyof Currency, number>>({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  insufficientFundsDenom = signal<keyof Currency | null>(null);

  localChar       = signal<Character | null>(null);
  raceData        = signal<DndRace | null>(null);
  bgData          = signal<DndBackground | null>(null);
  itemsAll        = signal<DndItem[]>([]);
  spellsAll       = signal<DndSpell[]>([]);
  monstersAll     = signal<DndMonster[]>([]);
  sourcesAll      = signal<DndContentSource[]>([]);
  spellLists      = signal<Record<string, string[]>>({});
  featsAll        = signal<DndFeat[]>([]);
  resolvedClasses = signal<ResolvedClass[]>([]);

  activeCompanions = computed<ActiveCompanion[]>(() => {
    const byIndex = new Map(this.monstersAll().map(monster => [monster.index, monster]));
    const companions = new Map<string, ActiveCompanion>();
    for (const resolved of this.resolvedClasses()) {
      for (const grant of reachableGrants(resolved.data, resolved.subclassName, resolved.level)) {
        if (grant.type !== 'companion_grant') continue;
        const monster = byIndex.get(grant.monsterIndex);
        if (monster) companions.set(monster.index, { monster, source: resolved.subclassName || resolved.name, detail: grant.description });
      }
    }
    for (const row of this.spellRows()) {
      const index = row.spell.companion_index;
      const monster = index ? byIndex.get(index) : undefined;
      if (monster) companions.set(index!, { monster, source: row.origins.map(origin => origin.sourceName).join(', '), detail: row.spell.description });
    }
    return [...companions.values()];
  });

  primaryClass = computed(() => this.resolvedClasses()[0]?.data ?? null);

  stats = computed(() => {
    const char = this.localChar();
    if (!char) return null;
    const classesForFeats = this.resolvedClasses().map(rc => ({ data: rc.data, choices: rc.choices, level: rc.level, subclass: rc.subclassName }));
    return this.statsService.compute(
      char, this.primaryClass(), this.raceData(), this.featsAll(), classesForFeats, this.itemsAll(), this.bgData(),
    );
  });

  actions = computed<CharacterAction[]>(() => {
    const char = this.localChar();
    if (!char) return [];
    const classesForFeats = this.resolvedClasses().map(rc => ({
      data: rc.data, level: rc.level, subclass: rc.subclassName, choices: rc.choices,
    }));
    const featSelections = resolveCharacterFeatPicks(
      classesForFeats,
      this.featsAll(),
      this.raceData() ? { data: this.raceData()!, choices: char.race_choices ?? {}, subrace: char.subrace } : null,
    );
    const originFeat = resolveBackgroundOriginFeat(this.bgData(), this.featsAll());
    if (originFeat) featSelections.push({
      feat: originFeat, scope: `background:${this.bgData()!.index}:origin`, choices: char.background_choices ?? {},
    });
    const equipped = new Set([
      ...char.equipment.filter(entry => entry.equipped).map(entry => entry.itemIndex),
      ...(char.replicated_items ?? []).filter(entry => entry.equipped).map(entry => entry.itemIndex),
    ]);
    const classes = this.resolvedClasses().map(rc => ({ data: rc.data, level: rc.level, subclass: rc.subclass, choices: rc.choices }));
    return this.actionsService.compute(classes, char.resource_uses ?? {}, char.ability_scores, {
      characterLevel: char.level,
      race: this.raceData() ? { data: this.raceData()!, choices: char.race_choices ?? {} } : null,
      feats: featSelections.map(selection => ({ feat: selection.feat, choices: selection.choices })),
      items: this.itemsAll().filter(item => equipped.has(item.index)),
    });
  });

  // The Actions-tab groups, in display order: weapon/spell attacks (below), then trackable
  // class features split by their action economy — Bonus Actions, Special ("free" activation
  // — resources like Action Surge that don't cost any action-economy slot at all), Reactions,
  // then plain Actions (activation 'action') alongside the static reference lists below.
  actionResourceActions   = computed(() => this.actions().filter(a => a.activation === 'action'));
  reactionResourceActions = computed(() => this.actions().filter(a => a.activation === 'reaction'));
  bonusActions         = computed(() => this.actions().filter(a => a.activation === 'bonus_action'));
  specialActions       = computed(() => this.actions().filter(a => a.activation === 'free'));

  // The standard PHB actions every character can always take — not class-specific data, so a
  // fixed reference list rather than something resolved from grants.
  readonly universalActions: DisplayFeature[] = [
    { source: 'Action', name: 'Dash', detail: 'Gain extra movement equal to your Speed.' },
    { source: 'Action', name: 'Disengage', detail: "Your movement doesn't provoke opportunity attacks for the rest of the turn." },
    { source: 'Action', name: 'Dodge', detail: 'Until your next turn, attack rolls against you have disadvantage (if you can see the attacker), and you make Dexterity saves with advantage.' },
    { source: 'Action', name: 'Help', detail: "Give an ally advantage on their next ability check for a task, or on their next attack against a creature within 5 ft. of you." },
    { source: 'Action', name: 'Hide', detail: 'Make a Dexterity (Stealth) check to become hidden.' },
    { source: 'Action', name: 'Ready', detail: 'Choose a trigger and an action or movement to take in response to it, using your reaction when it occurs.' },
    { source: 'Action', name: 'Search', detail: 'Make a Wisdom (Perception) or Intelligence (Investigation) check to find something.' },
    { source: 'Action', name: 'Use an Object', detail: 'Interact with a second object, or use an object that requires your action.' },
  ];

  // The standard PHB reaction every character can always take.
  readonly universalReactions: DisplayFeature[] = [
    { source: 'Reaction', name: 'Opportunity Attack', detail: 'When a hostile creature you can see moves out of your reach, you can use your reaction to make one melee attack against it.' },
  ];

  // Weapons the character has actually chosen mastery for (across every weapon_mastery grant on
  // every selected class — the choice may be split across several levels, see fighter.json),
  // shown as a during-combat reference of the mastery property that triggers when they hit.
  masteredWeapons = computed<DisplayFeature[]>(() => {
    const items = this.itemsAll();
    const names = new Set<string>();
    for (const rc of this.resolvedClasses()) {
      const levels = [...rc.data.levels, ...(rc.subclass?.levels ?? [])];
      for (const grant of levels.flatMap(l => l.grants ?? [])) {
        if (grant.type !== 'weapon_mastery') continue;
        for (const name of rc.choices[grant.key] ?? []) names.add(name);
      }
    }
    return [...names]
      .map(name => items.find(it => it.name === name && it.mastery))
      .filter((it): it is DndItem => !!it)
      .map(it => ({ source: 'Weapon Mastery', name: `${it.name} — ${it.mastery!.property}`, detail: it.mastery!.description }));
  });

  // Choice grants flagged `display: 'special_action'` (e.g. Battle Master maneuvers) — each
  // selected option shown individually with its full rules text in the Actions tab's Special
  // Actions section, rather than collapsed into one comma-joined line on the Features list.
  // They carry no use counter of their own: they draw from an already-tracked pool (e.g.
  // Superiority Dice) that appears alongside them as a normal resource action.
  specialActionReferences = computed<DisplayFeature[]>(() => {
    const out: DisplayFeature[] = [];
    for (const rc of this.resolvedClasses()) {
      const source = rc.subclassName ? `${rc.name} (${rc.subclassName})` : rc.name;
      const levels = [...rc.data.levels, ...(rc.subclass?.levels ?? [])];
      for (const grant of levels.flatMap(l => l.grants ?? [])) {
        if (grant.type !== 'choice' || grant.display !== 'special_action') continue;
        for (const name of rc.choices[grant.key] ?? []) {
          const option = grant.options.find(o => o.name === name);
          if (option) out.push({ source, name: option.name, detail: option.description });
        }
      }
    }
    return out;
  });

  inventoryItems = computed(() => {
    const char = this.localChar();
    if (!char) return [];
    const items = this.itemsAll();
    // Equipped items float to the top; order within each group is otherwise preserved
    // (Array.prototype.sort is stable).
    return char.equipment
      .map(e => ({ entry: e, item: items.find(it => it.index === e.itemIndex) ?? null }))
      .sort((a, b) => Number(b.entry.equipped) - Number(a.entry.equipped));
  });

  pactWeaponOptions = computed(() => this.itemsAll()
    .filter(item => item.type === 'weapon'
      && item.category.includes('Melee')
      && (item.category.startsWith('Simple') || item.category.startsWith('Martial')))
    .sort((a, b) => a.name.localeCompare(b.name)));

  replicationLimit = computed(() => {
    const artificer = this.resolvedClasses().find(resolved => resolved.data.index === 'artificer');
    const level = artificer?.data.levels.find(entry => entry.level === artificer.level);
    return Number(level?.class_specific?.['replicated_items'] ?? 0);
  });

  replicablePlans = computed(() => {
    const artificer = this.resolvedClasses().find(resolved => resolved.data.index === 'artificer');
    if (!artificer) return [];
    const grant = artificer.data.levels.flatMap(level => level.grants ?? [])
      .find((candidate): candidate is Extract<TraitGrant, { type: 'choice' }> =>
        candidate.type === 'choice' && candidate.key === 'magic_item_plans');
    if (!grant) return [];
    const selected = new Set(artificer.choices[grant.key] ?? []);
    return grant.options
      .filter(option => selected.has(option.name) && option.itemIndex)
      .map(option => ({ option, item: this.itemsAll().find(item => item.index === option.itemIndex) ?? null }))
      .filter((entry): entry is { option: typeof grant.options[number]; item: DndItem } => !!entry.item);
  });

  activeReplicatedItems = computed(() => {
    const char = this.localChar();
    if (!char) return [];
    return (char.replicated_items ?? []).map(entry => ({
      entry, item: this.itemsAll().find(item => item.index === entry.itemIndex) ?? null,
    }));
  });

  isReplicatedItemActive(itemIndex: string): boolean {
    return this.localChar()?.replicated_items?.some(entry => entry.itemIndex === itemIndex) ?? false;
  }

  grantItemResults = computed(() => {
    const query = this.grantItemSearch().trim().toLowerCase();
    const items = this.itemsAll();
    if (!query) return items;
    return items.filter(item => item.name.toLowerCase().includes(query));
  });

  // Excludes anything the character already has, whether from class/race/feat progression or an
  // earlier grant — spellRows() already folds granted spells in alongside every other origin.
  grantSpellResults = computed(() => {
    const query = this.grantSpellSearch().trim().toLowerCase();
    const known = new Set(this.spellRows().map(row => row.spell.index));
    const spells = this.spellsAll().filter(spell => !known.has(spell.index));
    if (!query) return spells;
    return spells.filter(spell => spell.name.toLowerCase().includes(query));
  });

  spellResolution = computed(() => {
    const char = this.localChar();
    if (!char) return null;
    const race = this.raceData();
    const background = this.bgData();
    const subrace = race && char.subrace ? race.subraces.find(candidate => candidate.name === char.subrace) ?? null : null;
    const featSelections = resolveCharacterFeatPicks(
      this.resolvedClasses().map(rc => ({
        data: rc.data, choices: rc.choices, level: rc.level, subclass: rc.subclassName,
      })),
      this.featsAll(),
      race ? { data: race, choices: char.race_choices ?? {}, subrace: char.subrace } : null,
    );
    const originFeat = resolveBackgroundOriginFeat(background, this.featsAll());
    if (background && originFeat) {
      const list = background.feature.match(/\((Cleric|Druid|Wizard)\)/i)?.[1];
      featSelections.push({
        feat: originFeat,
        scope: `background:${background.index}:origin`,
        choices: {
          ...(char.background_choices ?? {}),
          ...(list ? { magic_initiate_list: [list] } : {}),
        },
      });
    }
    return resolveSpellcasting({
      characterLevel: char.level,
      abilityScores: char.ability_scores,
      spells: this.spellsAll(),
      spellLists: this.spellLists(),
      classes: this.resolvedClasses().map(rc => ({
        cls: rc.data,
        level: rc.level,
        subclass: rc.subclassName,
        choices: rc.choices,
      })),
      race: race ? { race, subrace, choices: char.race_choices ?? {} } : null,
      background: background ? { background, choices: char.background_choices ?? {} } : null,
      feats: featSelections,
      spellChoices: char.spell_choices ?? {},
      grantedSpells: (char.granted_spells ?? []).map(g => ({ spellIndex: g.spellIndex, sourceName: g.sourceName })),
    });
  });

  spellRows = computed<DisplaySpell[]>(() => {
    const resolution = this.spellResolution();
    if (!resolution) return [];
    const spellByIndex = new Map(this.spellsAll().map(spell => [spell.index, spell]));
    const rows = new Map<string, DisplaySpell>();
    const priority = { known: 0, spellbook: 1, prepared: 2, always_prepared: 3 } as const;
    for (const origin of [
      ...resolution.known,
      ...resolution.spellbook,
      ...resolution.prepared,
      ...resolution.alwaysPrepared,
    ]) {
      const spell = spellByIndex.get(origin.spellIndex);
      if (!spell) continue;
      const key = origin.spellIndex;
      const current = rows.get(key);
      if (!current) {
        rows.set(key, { spell, origins: [origin], origin, category: origin.category });
      } else {
        current.origins.push(origin);
        if (priority[origin.category] > priority[current.category]) {
          current.category = origin.category;
          current.origin = origin;
        }
      }
    }
    return [...rows.values()].sort((a, b) =>
      a.spell.level - b.spell.level
      || a.spell.name.localeCompare(b.spell.name));
  });

  castableSpells = computed(() => this.spellRows().filter(row => row.origins.some(origin => origin.category !== 'spellbook')));
  private spellRollsMatching(predicate: (spell: DndSpell) => boolean): DisplaySpellRoll[] {
    const rolls: DisplaySpellRoll[] = [];
    for (const row of this.castableSpells()) {
      if (!predicate(row.spell) || this.castingTimeKind(row.spell) === 'bonus_action') continue;
      const seen = new Set<string>();
      for (const origin of row.origins.filter(candidate => candidate.category !== 'spellbook')) {
        if (seen.has(origin.sourceKey)) continue;
        seen.add(origin.sourceKey);
        rolls.push({ spell: row.spell, origin });
      }
    }
    return rolls.sort((a, b) => a.spell.name.localeCompare(b.spell.name) || a.origin.sourceName.localeCompare(b.origin.sourceName));
  }
  // Attack-roll spells and no-save spells with rolled damage. Save-only spells remain in Spells.
  spellAttacks = computed<DisplaySpellRoll[]>(() => this.spellRollsMatching(isSpellAttackAction));
  bonusActionSpells = computed(() => this.castableSpells()
    .filter(row => this.castingTimeKind(row.spell) === 'bonus_action'));
  reactionSpells = computed(() => this.castableSpells()
    .filter(row => this.castingTimeKind(row.spell) === 'reaction'));
  hasPactBlade = computed(() => this.resolvedClasses().some(rc =>
    rc.data.index === 'warlock'
    && Object.values(rc.choices).some(selected => selected.includes('Pact of the Blade'))));
  bonusActionFeatures = computed<DisplayFeature[]>(() => {
    const out: DisplayFeature[] = [];
    if (this.hasPactBlade()) {
      out.push(
        { source: 'Warlock', name: 'Pact of the Blade: Conjure', detail: 'Conjure a Simple or Martial melee weapon in your hand and bond with it.' },
        { source: 'Warlock', name: 'Pact of the Blade: Bond', detail: 'Touch a magic weapon and form your pact bond with it.' },
      );
    }
    return out;
  });

  spellSchools = computed(() => [...new Set(this.spellRows().map(row => row.spell.school))].sort());
  spellSources = computed(() => [...new Set(this.spellRows().flatMap(row => row.origins.map(origin => origin.sourceName)))].sort());
  filteredSpellRows = computed(() => {
    const filters = this.spellFilters();
    const search = filters.search.trim().toLowerCase();
    return this.spellRows().filter(row => {
      if (search && !`${row.spell.name} ${row.spell.description}`.toLowerCase().includes(search)) return false;
      if (filters.level && String(row.spell.level) !== filters.level) return false;
      if (filters.school && row.spell.school !== filters.school) return false;
      if (filters.source && !row.origins.some(origin => origin.sourceName === filters.source)) return false;
      if (filters.castingTime && this.castingTimeKind(row.spell) !== filters.castingTime) return false;
      if (filters.ritual && !row.spell.ritual) return false;
      if (filters.concentration && !row.spell.concentration) return false;
      if (filters.prepared && !row.origins.some(origin => origin.category === filters.prepared)) return false;
      return true;
    });
  });
  cantripRows = computed(() => this.filteredSpellRows().filter(row => row.spell.level === 0));
  leveledSpellRows = computed(() => this.filteredSpellRows().filter(row => row.spell.level > 0));

  resolvedFeatures = computed<DisplayFeature[]>(() => {
    const char = this.localChar();
    if (!char) return [];
    const out: DisplayFeature[] = [];

    const race = this.raceData();
    if (race) {
      const raceChoices = char.race_choices ?? {};
      for (const grant of this.grantsOrLegacy(race.grants, race.traits)) {
        out.push(...this.describeGrant(grant, raceChoices, race.name));
      }
      const sub = char.subrace ? race.subraces.find(s => s.name === char.subrace) : null;
      if (sub) {
        for (const grant of this.grantsOrLegacy(sub.grants, sub.traits)) {
          out.push(...this.describeGrant(grant, raceChoices, sub.name));
        }
      }
    }

    for (const rc of this.resolvedClasses()) {
      const source = rc.subclassName ? `${rc.name} (${rc.subclassName})` : rc.name;
      const levels = [...rc.data.levels, ...(rc.subclass?.levels ?? [])];
      for (const lvl of levels) {
        if (lvl.level > rc.level) continue;
        if (lvl.grants?.length) {
          for (const grant of lvl.grants) out.push(...this.describeGrant(grant, rc.choices, source));
        } else {
          for (const f of lvl.features) out.push({ source, name: f });
        }
      }
    }

    return out;
  });

  private describeChoicePicks(
    grant: Extract<TraitGrant, { type: 'choice' }>, choices: Record<string, string[]>, source: string,
  ): DisplayFeature[] {
    const picked = choices[grant.key] ?? [];
    if (!picked.length) return [];
    return [{ source, name: grant.name, detail: picked.join(', ') }];
  }

  private grantsOrLegacy(grants: TraitGrant[] | undefined, traits: string[]): TraitGrant[] {
    return grants?.length ? grants : traits.map(name => ({ type: 'feature', name }) as TraitGrant);
  }

  private describeGrant(grant: TraitGrant, choices: Record<string, string[]>, source: string): DisplayFeature[] {
    switch (grant.type) {
      case 'feature':
        return [{ source, name: grant.name, detail: grant.description }];
      case 'choice':
        if (grant.display === 'special_action') return []; // shown in Actions tab instead, see specialActionReferences
        return this.describeChoicePicks(grant, choices, source);
      case 'skill_choice':
      case 'weapon_mastery': {
        const picked = choices[grant.key] ?? [];
        if (!picked.length) return [];
        return [{ source, name: grant.name, detail: picked.join(', ') }];
      }
      case 'ability_choice': {
        const featIndex = grant.allowFeat ? choices[`${grant.key}:feat`]?.[0] : undefined;
        if (featIndex) {
          const feat = this.featsAll().find(f => f.index === featIndex);
          return feat ? [{ source, name: feat.name, detail: feat.description }] : [];
        }
        const picked = choices[grant.key] ?? [];
        if (!picked.length) return [];
        const counts = new Map<string, number>();
        for (const a of picked) counts.set(a, (counts.get(a) ?? 0) + 1);
        const detail = [...counts.entries()]
          .map(([a, n]) => `+${n} ${a.charAt(0).toUpperCase()}${a.slice(1)}`)
          .join(', ');
        return [{ source, name: grant.name, detail }];
      }
      case 'feat_pick': {
        return (choices[grant.key] ?? [])
          .map(index => this.featsAll().find(feat => feat.index === index))
          .filter((feat): feat is DndFeat => !!feat)
          .map(feat => ({ source, name: feat.name, detail: feat.description }));
      }
      default:
        return [];
    }
  }

  // Distinguishes "a different character was picked" (reload content, reset to Stats tab)
  // from "the same character came back down after a save round-trip" (just refresh the local
  // copy in place) — interactive actions (Use, Rest, equip/slot toggles) save and emit the
  // updated character back through the parent, which re-feeds it into this same input.
  private loadedId: string | null | undefined = undefined;

  constructor() {
    effect(() => {
      const char = this.character();
      if (char.id !== this.loadedId) {
        this.loadedId = char.id;
        this.activeTab.set('stats');
        this.load(char);
      } else {
        this.localChar.set(char);
      }
    });
  }

  private async load(char: Character) {
    this.loading.set(true);
    this.localChar.set(char);

    const classEntries = char.classes?.length
      ? char.classes
      : (char.class ? [{ name: char.class, level: char.level, subclass: char.subclass, choices: {} as Record<string, string[]> }] : []);

    const campaignId = char.campaign_id ?? undefined;
    // A campaign exposes the campaign DM's custom library. A standalone character has no
    // campaign through which to resolve that library, so include the current user's own items.
    const itemsPromise = campaignId
      ? this.content.getItems(campaignId)
      : Promise.all([this.content.getItems(), this.itemService.getMine()])
          .then(([official, custom]) => [...official, ...custom]);
    const [race, bg, items, spells, spellLists, feats, monsters, sources] = await Promise.all([
      char.race ? this.content.getRace(toIndex(char.race)).catch(() => null) : Promise.resolve(null),
      char.background ? this.content.getBackground(toIndex(char.background)).catch(() => null) : Promise.resolve(null),
      itemsPromise,
      this.content.getSpells(campaignId),
      this.content.getSpellLists(),
      this.content.getFeats(),
      this.content.getMonsters(campaignId),
      this.content.getSources(),
    ]);

    const classDataList = await Promise.all(classEntries.map(c => this.content.getClass(toIndex(c.name)).catch(() => null)));

    const enabledSources = new Set(char.enabled_sources ?? sources
      .filter(source => source.player_options && (source.default_enabled || source.locked))
      .map(source => source.code));
    const include = <T extends { source?: { code: string } }>(entry: T) =>
      characterContentEnabled(entry, enabledSources, sources);

    const resolved: ResolvedClass[] = classEntries
      .map((c, i) => {
        const data = classDataList[i];
        if (!data) return null;
        const subclass = c.subclass
          ? data.subclasses.find(s => s.name === c.subclass && include(s)) ?? null
          : null;
        return { name: c.name, data, level: c.level, subclassName: c.subclass ?? '', subclass, choices: c.choices ?? {} };
      })
      .filter((c): c is ResolvedClass => c !== null);

    this.raceData.set(race);
    this.bgData.set(bg);
    this.itemsAll.set(items.filter(include));
    this.spellsAll.set(spells.filter(include));
    this.monstersAll.set(monsters.filter(include));
    this.sourcesAll.set(sources);
    this.spellLists.set(spellLists);
    this.featsAll.set(feats.filter(include));
    this.resolvedClasses.set(resolved);
    this.pactWeaponSelection.set(char.pact_weapon?.itemIndex ?? this.pactWeaponOptions()[0]?.index ?? '');
    this.loading.set(false);
  }

  // char.armor_class is a stored field, not derived (see character.model.ts) — everywhere outside
  // this sheet (campaign hub, encounter roster) reads it directly, so a stale value there would
  // sit at whatever the wizard last set regardless of what's actually equipped now. Keep it in
  // sync with the same live formula the sheet itself displays (`stats().computed_ac`) every time
  // something is persisted, not just on equip toggles — cheap, and never wrong.
  private computeArmorClass(char: Character): number {
    const classesForFeats = this.resolvedClasses().map(rc => ({ data: rc.data, choices: rc.choices, level: rc.level, subclass: rc.subclassName }));
    return this.statsService.compute(
      char, this.primaryClass(), this.raceData(), this.featsAll(), classesForFeats, this.itemsAll(), this.bgData(),
    ).computed_ac;
  }

  private async persist(next: Character) {
    const withAc = { ...next, armor_class: this.computeArmorClass(next) };
    this.localChar.set(withAc);
    this.persisting.set(true);
    try {
      const result = await this.characterService.saveCharacter(withAc);
      this.localChar.set(result);
      this.saved.emit(result);
    } finally {
      this.persisting.set(false);
    }
  }

  fmt(n: number): string {
    return this.statsService.fmt(n);
  }

  slotLevels(pool: ResolvedSpellSlotPool): [string, number][] {
    return Object.entries(pool.slots).filter(([, count]) => count > 0);
  }

  slotPips(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index);
  }

  spellCategoryLabel(category: ResolvedSpellCategory): string {
    return {
      known: 'Known',
      spellbook: 'Spellbook',
      prepared: 'Prepared',
      always_prepared: 'Always Prepared',
    }[category];
  }

  spellDamageFormula(spell: DndSpell, origin: ResolvedSpellOrigin): string | null {
    const char = this.localChar();
    const abilityDamage = /(?:plus|add) your spellcasting ability modifier/i.test(spell.description)
      || spell.index === 'eldritch-blast' && this.hasClassChoice('Warlock', 'Agonizing Blast');
    let modifier = 0;
    if (abilityDamage && char && origin.castingAbility) {
      modifier = abilityModifier(char.ability_scores[origin.castingAbility]);
    }
    return resolveSpellAttackDamage(spell, char?.level ?? 1, modifier);
  }

  spellDamageType(spell: DndSpell): string {
    return spell.mechanics.damage_types.join('/');
  }

  private hasClassChoice(className: string, choice: string): boolean {
    return this.resolvedClasses().some(rc =>
      rc.name === className && Object.values(rc.choices).some(selected => selected.includes(choice)));
  }

  hpPercent(char: Character): number {
    return !char.max_hp ? 0 : Math.round((char.current_hp / char.max_hp) * 100);
  }

  hpColor(char: Character): string {
    const pct = this.hpPercent(char);
    return pct <= 25 ? 'bg-danger' : pct <= 50 ? 'bg-yellow-500' : 'bg-success';
  }

  setHpAdjustAmount(value: string) {
    this.hpAdjustAmount.set(Math.max(0, Math.floor(+value || 0)));
  }

  // Damage (negative delta) or healing (positive delta), clamped to [0, max_hp] — current_hp
  // can't go negative (that's what death saves track) or overheal past max.
  applyHpDelta(delta: number) {
    const char = this.localChar();
    if (!char || !delta) return;
    const next = Math.max(0, Math.min(char.max_hp, char.current_hp + delta));
    if (next === char.current_hp) return;
    this.persist({ ...char, current_hp: next });
  }

  toggleHeroicInspiration() {
    const char = this.localChar();
    if (!char || this.persisting()) return;
    this.persist({ ...char, heroic_inspiration: !char.heroic_inspiration });
  }

  // Actions
  useAction(action: CharacterAction) {
    const char = this.localChar();
    if (!char) return;
    this.persist({ ...char, resource_uses: this.actionsService.use(char.resource_uses ?? {}, action) });
  }

  restoreAction(action: CharacterAction) {
    const char = this.localChar();
    if (!char) return;
    this.persist({ ...char, resource_uses: this.actionsService.restore(char.resource_uses ?? {}, action) });
  }

  async rest(type: 'short_rest' | 'long_rest') {
    const char = this.localChar();
    if (!char?.id || this.persisting()) return;
      if (type === 'short_rest') {
        this.shortRestHitDice.set(0);
        this.shortRestHealed.set(0);
        this.shortRestError.set('');
        this.showShortRestDialog.set(true);
        return;
      }

      this.persisting.set(true);
      try {
        await this.characterService.saveCharacter({
          ...char,
          resource_uses: this.actionsService.rest(char.resource_uses ?? {}, this.actions(), type),
        });
        await this.characterService.restoreSpellcasting(char.id, type);
        const healedResult = await this.characterService.restoreHitPoints(char.id, type);
        this.localChar.set(healedResult);
        this.saved.emit(this.localChar()!);
        this.castNotice.set(type === 'long_rest' ? 'Long Rest complete.' : 'Short Rest complete. Pact Magic and short-rest free casts restored.');
      } finally {
        this.persisting.set(false);
      }
  }

    openShortRestDialog() {
      const char = this.localChar();
      if (!char) return;
      this.shortRestHitDice.set(0);
      this.shortRestHealed.set(0);
      this.shortRestError.set('');
      this.showShortRestDialog.set(true);
    }

    closeShortRestDialog() {
      this.showShortRestDialog.set(false);
      this.shortRestError.set('');
    }

    async confirmShortRest() {
      const char = this.localChar();
      if (!char?.id || this.persisting()) return;
      const hitDiceUsed = Math.max(0, Math.floor(this.shortRestHitDice()));
      const healed = Math.max(0, Math.floor(this.shortRestHealed()));
      const available = Math.max(0, (char.level ?? 0) - (char.hit_dice_used ?? 0));
      if (hitDiceUsed > available) {
        this.shortRestError.set(`You only have ${available} hit dice available.`);
        return;
      }
      this.persisting.set(true);
      this.shortRestBusy.set(true);
      try {
        await this.characterService.saveCharacter({
          ...char,
          resource_uses: this.actionsService.rest(char.resource_uses ?? {}, this.actions(), 'short_rest'),
        });
        await this.characterService.restoreSpellcasting(char.id, 'short_rest');
        const healedResult = await this.characterService.restoreHitPoints(char.id, 'short_rest', hitDiceUsed, healed);
        this.localChar.set(healedResult);
        this.saved.emit(this.localChar()!);
        this.castNotice.set('Short Rest complete. Pact Magic and short-rest free casts restored.');
        this.showShortRestDialog.set(false);
      } catch (err) {
        this.shortRestError.set(`Could not complete short rest. ${err}`);
      } finally {
        this.persisting.set(false);
        this.shortRestBusy.set(false);
      }
    }

  // Inventory
  toggleEquipped(entry: EquipmentEntry) {
    const char = this.localChar();
    if (!char) return;
    const equipment = char.equipment.map(e => e.itemIndex === entry.itemIndex ? { ...e, equipped: !e.equipped } : e);
    this.persist({ ...char, equipment });
  }

  async updateReplicatedItem(action: 'create' | 'dismiss' | 'toggle', itemIndex: string) {
    const char = this.localChar();
    if (!char?.id || this.replicateItemBusy()) return;
    this.replicateItemBusy.set(true);
    this.replicateItemError.set('');
    try {
      const result = await this.characterService.updateReplicatedItem(char.id, action, itemIndex);
      this.localChar.set(result);
      this.saved.emit(result);
    } catch (error) {
      const response = error as { error?: { message?: string | string[] } };
      const message = response.error?.message;
      this.replicateItemError.set(Array.isArray(message) ? message.join(' ') : message ?? 'Could not update the replicated item.');
    } finally {
      this.replicateItemBusy.set(false);
    }
  }

  async updatePactWeapon(action: 'conjure' | 'bond' | 'dismiss', itemIndex?: string) {
    const char = this.localChar();
    if (!char?.id || this.pactWeaponBusy()) return;
    const selected = itemIndex ?? this.pactWeaponSelection();
    if (action !== 'dismiss' && !selected) {
      this.pactWeaponError.set('Choose a melee weapon first.');
      return;
    }
    this.pactWeaponBusy.set(true);
    this.pactWeaponError.set('');
    try {
      const result = await this.characterService.updatePactWeapon(char.id, action, selected || undefined);
      this.localChar.set(result);
      this.pactWeaponSelection.set(result.pact_weapon?.itemIndex ?? this.pactWeaponOptions()[0]?.index ?? '');
      this.saved.emit(result);
    } catch (error) {
      const response = error as { error?: { message?: string | string[] } };
      const message = response.error?.message;
      this.pactWeaponError.set(Array.isArray(message) ? message.join(' ') : message ?? 'Could not update the pact weapon.');
    } finally {
      this.pactWeaponBusy.set(false);
    }
  }

  // DM-only counterpart to grantItem — takes the whole stack back (see
  // CharacterService.revokeItem / CharactersService.revokeItem for the partial-quantity form,
  // unused here since "remove this from their inventory" is the sheet's only entry point).
  async revokeItem(entry: EquipmentEntry) {
    const char = this.localChar();
    if (!char?.id || this.persisting()) return;
    if (!await this.confirm.confirm(`Remove ${entry.name} from ${char.name}'s inventory?`, 'Remove Item')) return;
    this.persisting.set(true);
    try {
      const result = await this.characterService.revokeItem(char.id, entry.itemIndex);
      this.localChar.set(result);
      this.saved.emit(result);
    } finally {
      this.persisting.set(false);
    }
  }

  openGrantItemDialog() {
    this.grantItemSearch.set('');
    this.grantItemQuantity.set(1);
    this.grantItemCreatingCustom.set(false);
    this.grantItemError.set('');
    this.grantItemNotice.set('');
    this.showGrantItemDialog.set(true);
  }

  closeGrantItemDialog() {
    this.showGrantItemDialog.set(false);
    this.grantItemCreatingCustom.set(false);
  }

  setGrantItemQuantity(value: string) {
    this.grantItemQuantity.set(Math.max(1, Math.floor(+value || 1)));
  }

  async grantItem(item: DndItem) {
    const char = this.localChar();
    if (!char?.id || this.grantItemBusy()) return;
    this.grantItemBusy.set(true);
    this.grantItemError.set('');
    this.grantItemNotice.set('');
    try {
      const quantity = this.grantItemQuantity();
      const result = await this.characterService.grantItem(char.id, item.index, quantity);
      this.localChar.set(result);
      this.saved.emit(result);
      this.grantItemNotice.set(`Gave ${char.name} ${quantity > 1 ? quantity + '× ' : ''}${item.name}.`);
    } catch (error: unknown) {
      const candidate = error as { error?: { message?: string | string[] } };
      const message = candidate.error?.message;
      this.grantItemError.set(Array.isArray(message) ? message.join(' ') : message ?? 'Could not grant that item.');
    } finally {
      this.grantItemBusy.set(false);
    }
  }

  // The item form always creates a brand-new custom item (see ItemFormComponent) — fold it into
  // this sheet's already-loaded catalog so it shows up in the search list without a reload, then
  // hand it straight to the same grant flow as a catalog pick.
  onCustomItemGranted(item: DndItem) {
    this.itemsAll.update(items => [...items, item]);
    this.grantItemCreatingCustom.set(false);
    void this.grantItem(item);
  }

  openGrantSpellDialog() {
    this.grantSpellSearch.set('');
    this.grantSpellError.set('');
    this.grantSpellNotice.set('');
    this.showGrantSpellDialog.set(true);
  }

  closeGrantSpellDialog() {
    this.showGrantSpellDialog.set(false);
  }

  async grantSpell(spell: DndSpell) {
    const char = this.localChar();
    if (!char?.id || this.grantSpellBusy()) return;
    this.grantSpellBusy.set(true);
    this.grantSpellError.set('');
    this.grantSpellNotice.set('');
    try {
      const result = await this.characterService.grantSpell(char.id, spell.index);
      this.localChar.set(result);
      this.saved.emit(result);
      this.grantSpellNotice.set(`Gave ${char.name} ${spell.name}.`);
    } catch (error: unknown) {
      const candidate = error as { error?: { message?: string | string[] } };
      const message = candidate.error?.message;
      this.grantSpellError.set(Array.isArray(message) ? message.join(' ') : message ?? 'Could not grant that spell.');
    } finally {
      this.grantSpellBusy.set(false);
    }
  }

  // A row is DM-granted (rather than earned through class/race/feat progression) when every
  // origin backing it comes from the synthetic `granted:dm:` source resolveSpellcasting creates
  // for each entry in `granted_spells` — see spellcasting.ts.
  isGrantedSpell(row: DisplaySpell): boolean {
    return row.origins.every(origin => origin.sourceKey.startsWith('granted:dm:'));
  }

  async revokeSpell(row: DisplaySpell) {
    const char = this.localChar();
    if (!char?.id || this.persisting()) return;
    if (!await this.confirm.confirm(`Remove ${row.spell.name} from ${char.name}'s spells?`, 'Remove Spell')) return;
    this.persisting.set(true);
    try {
      const result = await this.characterService.revokeSpell(char.id, row.spell.index);
      this.localChar.set(result);
      this.saved.emit(result);
    } finally {
      this.persisting.set(false);
    }
  }

  setCurrencyAdjustAmount(denom: keyof Currency, value: string) {
    this.currencyAdjustAmounts.update(amounts => ({ ...amounts, [denom]: Math.max(0, Math.floor(+value || 0)) }));
  }

  // The generated portrait shown in the sheet header, from the same recipe/seed pair every other
  // portrait render uses (party list, tokens, dashboard).
  portraitUri = computed(() => {
    const char = this.localChar();
    if (!char) return '';
    return portraitDataUri(portraitSource(char.portrait_seed || char.id!, char.avatar_recipe));
  });

  // Picking a portrait is player agency we keep even when the DM has locked the wizard — the
  // backend whitelists portrait_seed/avatar_recipe on a locked campaign copy (PLAYER_EDITABLE_FIELDS).
  changePortrait() {
    const char = this.localChar();
    if (!char) return;
    this.dialog.open(AvatarCreatorDialogComponent, {
      data: { seed: char.portrait_seed || char.id || '', recipe: char.avatar_recipe },
      width: '960px',
      maxWidth: 'calc(100vw - 16px)',
      maxHeight: 'calc(100vh - 16px)',
      autoFocus: false,
    }).afterClosed().subscribe((result: AvatarRecipeV1 | null | undefined) => {
      const recipe = normalizeAvatarRecipe(result);
      if (!recipe) return;
      this.persist({ ...char, portrait_seed: recipe.seed, avatar_recipe: recipe });
    });
  }

  // Renaming is player agency we keep even when the DM has locked the wizard — flavor only, like
  // the portrait, so the backend accepts it separately from the rest of PLAYER_EDITABLE_FIELDS
  // (see CharactersService.updatePlayerEditableFields; `name` is a column, not a data-blob key).
  editingName = signal(false);
  nameDraft   = signal('');

  startEditingName() {
    const char = this.localChar();
    if (!char) return;
    this.nameDraft.set(char.name);
    this.editingName.set(true);
  }

  confirmNameEdit() {
    const char = this.localChar();
    const name = this.nameDraft().trim();
    this.editingName.set(false);
    if (!char || !name || name === char.name) return;
    this.persist({ ...char, name });
  }

  cancelNameEdit() {
    this.editingName.set(false);
  }

  // Adding is always safe; removing more than is on hand of one denomination auto-calibrates by
  // breaking higher denominations (see adjustCurrency) and fails only if the whole purse can't
  // cover the withdrawal, in which case we flash a brief "insufficient funds" indicator instead.
  applyCurrencyDelta(denom: keyof Currency, sign: 1 | -1) {
    const char = this.localChar();
    const amount = this.currencyAdjustAmounts()[denom];
    if (!char || !amount) return;
    const next = adjustCurrency(char.currency, denom, sign * amount);
    if (!next) {
      this.insufficientFundsDenom.set(denom);
      setTimeout(() => this.insufficientFundsDenom.set(null), 1500);
      return;
    }
    this.persist({ ...char, currency: next });
  }

  slotUses(poolKey: string, level: string): number {
    const char = this.localChar();
    if (!char) return 0;
    return char.spell_slot_uses?.[poolKey]?.[level]
      ?? (poolKey === 'spellcasting' ? char.spell_slots_used?.[level] : 0)
      ?? 0;
  }

  castingTimeKind(spell: DndSpell): string {
    const value = spell.casting_time.toLowerCase();
    if (value.includes('bonus')) return 'bonus_action';
    if (value.includes('reaction')) return 'reaction';
    if (value.includes('action')) return 'action';
    return 'other';
  }

  updateSpellFilter<K extends keyof SpellFilters>(key: K, value: SpellFilters[K]) {
    this.spellFilters.update(filters => ({ ...filters, [key]: value }));
  }

  clearSpellFilters() {
    this.spellFilters.set({
      search: '', level: '', school: '', source: '', castingTime: '', ritual: false,
      concentration: false, prepared: '',
    });
  }

  categoryLabels(row: DisplaySpell): string[] {
    return [...new Set(row.origins.map(origin => this.spellCategoryLabel(origin.category)))];
  }

  spellSourceNames(row: DisplaySpell): string {
    return [...new Set(row.origins
      .filter(origin => origin.category !== 'spellbook')
      .map(origin => origin.sourceName))].join(', ');
  }

  descriptionSegments(description: string): DescriptionSegment[] {
    const segments: DescriptionSegment[] = [];
    const boldPattern = /\*\*(.+?)\*\*/gs;
    let cursor = 0;
    for (const match of description.matchAll(boldPattern)) {
      if (match.index > cursor) segments.push({ text: description.slice(cursor, match.index), bold: false });
      segments.push({ text: match[1], bold: true });
      cursor = match.index + match[0].length;
    }
    if (cursor < description.length) segments.push({ text: description.slice(cursor), bold: false });
    return segments.length ? segments : [{ text: description, bold: false }];
  }

  originLabel(origin: ResolvedSpellOrigin): string {
    const ability = origin.castingAbility ? ` · ${this.abilityShort[origin.castingAbility]}` : '';
    const attack = origin.spellAttackBonus === null ? '' : ` · Attack ${this.fmt(origin.spellAttackBonus)}`;
    const save = origin.spellSaveDc === null ? '' : ` · DC ${origin.spellSaveDc}`;
    return `${origin.sourceName}${ability}${attack}${save}`;
  }

  freeCastRemaining(origin: ResolvedSpellOrigin): number {
    if (!origin.freeCast) return 0;
    if (origin.freeCast.atWill) return Number.POSITIVE_INFINITY;
    const used = this.localChar()?.spell_free_cast_uses?.[origin.freeCast.key]?.used ?? 0;
    return Math.max(0, origin.freeCast.maxUses - used);
  }

  castingMethods(row: DisplaySpell): CastingMethod[] {
    const methods: CastingMethod[] = [];
    const castableOrigins = row.origins.filter(origin => origin.category !== 'spellbook');
    for (const origin of castableOrigins) {
      if (row.spell.level === 0) {
        methods.push({
          key: `cantrip:${origin.sourceKey}`,
          label: `Cast · ${origin.sourceName}`,
          detail: 'No spell slot',
          available: true,
          command: { spellIndex: row.spell.index, sourceKey: origin.sourceKey, method: 'cantrip' },
        });
      }
      if (origin.freeCast) {
        const remaining = this.freeCastRemaining(origin);
        methods.push({
          key: origin.freeCast.key,
          label: origin.freeCast.atWill ? `At will · ${origin.sourceName}` : `Free cast · ${origin.sourceName}`,
          detail: origin.freeCast.atWill
            ? 'No spell slot'
            : `${remaining}/${origin.freeCast.maxUses} · ${origin.freeCast.recovery === 'short_rest' ? 'Short Rest' : 'Long Rest'}`,
          available: origin.freeCast.atWill || remaining > 0,
          command: {
            spellIndex: row.spell.index,
            sourceKey: origin.sourceKey,
            method: 'free',
            freeCastKey: origin.freeCast.key,
            maxUses: origin.freeCast.maxUses,
            recovery: origin.freeCast.recovery,
            atWill: origin.freeCast.atWill,
            slotLevel: origin.freeCast.slotLevel ?? row.spell.level,
          },
        });
      }
    }
    if (row.spell.level > 0 && castableOrigins.length) {
      for (const pool of this.spellResolution()?.slotPools ?? []) {
        if (pool.allowedSpellIndices && !pool.allowedSpellIndices.includes(row.spell.index)) continue;
        for (const [level, maximum] of this.slotLevels(pool)) {
          const numericLevel = Number(level);
          if (numericLevel < row.spell.level) continue;
          const upcast = describeSpellUpcast(row.spell, numericLevel);
          // Pact Magic sometimes has no lower-level slot to offer. Keep that required casting
          // method, but offer normal higher-level slots only when the spell actually benefits.
          if (numericLevel > row.spell.level && pool.type === 'normal' && !upcast) continue;
          const remaining = Math.max(0, maximum - this.slotUses(pool.key, level));
          for (const origin of castableOrigins) {
            methods.push({
              key: `${pool.key}:${level}:${origin.sourceKey}`,
              label: `${pool.type === 'pact' ? 'Pact Magic' : pool.type === 'restricted' ? pool.name : 'Level ' + level} · ${origin.sourceName}`,
              detail: `${remaining}/${maximum} remaining${pool.type === 'pact' ? ` · level ${level} Pact slot` : pool.type === 'restricted' ? ` · level ${level}, Dragonmark spells only` : ''}`,
              available: remaining > 0,
              upcast: upcast ?? undefined,
              command: {
                spellIndex: row.spell.index,
                sourceKey: origin.sourceKey,
                method: pool.type === 'pact' ? 'pact' : pool.type === 'restricted' ? 'restricted' : 'slot',
                poolKey: pool.key,
                slotLevel: numericLevel,
              },
            });
          }
        }
      }
    }
    const unique = new Map(methods.map(method => [method.key, method]));
    return [...unique.values()];
  }

  openCastDialog(row: DisplaySpell) {
    this.castError.set('');
    this.pendingCastMethod.set(null);
    this.replacingConcentration.set(false);
    this.castDialogSpell.set(row);
  }

  closeCastDialog() {
    this.castDialogSpell.set(null);
    this.pendingCastMethod.set(null);
    this.replacingConcentration.set(false);
    this.castError.set('');
  }

  requestCast(method: CastingMethod) {
    if (!method.available || this.persisting()) return;
    const row = this.castDialogSpell();
    const active = this.localChar()?.active_concentration;
    if (row?.spell.concentration && active && active.spellIndex !== row.spell.index) {
      this.pendingCastMethod.set(method);
      this.replacingConcentration.set(true);
      return;
    }
    void this.performCast(method, false);
  }

  confirmConcentrationReplacement() {
    const method = this.pendingCastMethod();
    if (method) void this.performCast(method, true);
  }

  private async performCast(method: CastingMethod, replaceConcentration: boolean) {
    const char = this.localChar();
    const row = this.castDialogSpell();
    if (!char?.id || !row) return;
    this.persisting.set(true);
    this.castError.set('');
    try {
      const result = await this.characterService.castSpell(char.id, {
        ...method.command,
        replaceConcentration,
      });
      this.localChar.set(result.character);
      this.saved.emit(result.character);
      const roll = this.rollSpellEffect(row, result.cast.castLevel, method.command.sourceKey);
      this.castNotice.set(`${result.cast.spellName} cast using ${result.cast.resourceLabel}.${roll ? ` ${roll}` : ''}`);
      this.closeCastDialog();
    } catch (error: unknown) {
      const candidate = error as { error?: { message?: string | string[] } };
      const message = candidate.error?.message;
      this.castError.set(Array.isArray(message) ? message.join(' ') : message ?? 'The spell could not be cast.');
    } finally {
      this.persisting.set(false);
    }
  }

  async endConcentration() {
    const char = this.localChar();
    if (!char?.id || this.persisting()) return;
    this.persisting.set(true);
    try {
      const result = await this.characterService.endConcentration(char.id);
      this.localChar.set(result);
      this.saved.emit(result);
      this.castNotice.set('Concentration ended.');
    } finally {
      this.persisting.set(false);
    }
  }

  private rollSpellEffect(row: DisplaySpell, castLevel: number, sourceKey: string): string {
    const spell = row.spell;
    const origin = row.origins.find(candidate => candidate.sourceKey === sourceKey) ?? row.origin;
    const results: string[] = [];
    if (spell.mechanics.spell_attacks?.length && origin.spellAttackBonus !== null) {
      const d20 = Math.floor(Math.random() * 20) + 1;
      results.push(`Attack ${d20 + origin.spellAttackBonus} (${d20}${this.fmt(origin.spellAttackBonus)})`);
    }
    if (spell.mechanics.saving_throws.length && origin.spellSaveDc !== null) {
      results.push(`${spell.mechanics.saving_throws.join('/')} save DC ${origin.spellSaveDc}`);
    }
    let formula = '';
    if (spell.mechanics.scaling) {
      const threshold = Object.keys(spell.mechanics.scaling.values)
        .map(Number)
        .filter(level => level <= (spell.level === 0 ? (this.localChar()?.level ?? 1) : castLevel))
        .sort((a, b) => b - a)[0];
      formula = spell.mechanics.scaling.values[String(threshold)] ?? '';
    }
    if (!formula) formula = spell.description.match(/\b\d+d\d+(?:\s*[+-]\s*\d+)?\b/i)?.[0] ?? '';
    if (!formula) return results.join(' · ');
    if (castLevel > spell.level && spell.higher_levels) {
      const perLevel = spell.higher_levels.match(/(?:by|an extra)\s+(\d+d\d+)\s+(?:for each|per)/i)?.[1];
      if (perLevel) formula = `${formula} + ${castLevel - spell.level}${perLevel.replace(/^1/, '')}`;
    }
    const parts = [...formula.matchAll(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/gi)];
    if (!parts.length) return '';
    let total = 0;
    for (const part of parts) {
      const count = Number(part[1]);
      const sides = Number(part[2]);
      for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
      if (part[3]) total += (part[3] === '-' ? -1 : 1) * Number(part[4]);
    }
    if (/spellcasting ability modifier/i.test(spell.description) && origin.spellAttackBonus !== null) {
      const modifier = origin.spellAttackBonus - proficiencyBonus(this.localChar()?.level ?? 1);
      total += modifier;
      formula += ` ${this.fmt(modifier)}`;
    }
    const kind = spell.mechanics.damage_types.length
      ? `${spell.mechanics.damage_types.join('/')} damage`
      : /regains? (?:a number of )?hit points|healing/i.test(spell.description)
        ? 'healing'
        : 'effect';
    results.push(`${total} ${kind} (${formula})`);
    return results.join(' · ');
  }
}
