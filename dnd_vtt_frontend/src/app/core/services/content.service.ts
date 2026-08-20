import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from './auth-token.service';

const API = environment.apiUrl;

export interface DndContentSource {
  code: string;
  name: string;
  short_name: string;
  edition: number;
  description: string;
  default_enabled: boolean;
  locked?: boolean;
  player_options: boolean;
  requires: string[];
}

export interface DndSourceReference {
  code: string;
  book: string;
  edition: number;
  page?: number;
  srd_5_2_1?: boolean;
  srd_name?: string;
  rules_text?: 'SRD 5.2.1' | 'reference-only';
}

export interface SpellSlots {
  '1'?: number; '2'?: number; '3'?: number; '4'?: number; '5'?: number;
  '6'?: number; '7'?: number; '8'?: number; '9'?: number;
}
// A choice's mechanical effect (AC bonus, proficiency, etc.), computed generically
// instead of matched by display name.
export interface TraitEffect {
  type: string; // e.g. 'ac_bonus' | 'initiative_ability_bonus' | 'initiative_proficiency_bonus' | 'language_proficiency' | 'saving_throw_ability_bonus' | 'melee_damage_bonus' | 'special'
  value?: number;
  values?: number[];
  tags?: string[];
  ability?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
  minimum?: number;
  condition?: EffectCondition;
}

export type EffectCondition =
  | 'wearing_armor'
  | 'no_armor'
  | 'no_armor_or_shield'
  | 'no_heavy_armor'
  | 'wielding_shield'
  | 'two_handed_melee'
  | 'one_handed_melee_no_offhand'
  | 'dual_wielding_melee';

export interface TraitOption {
  name: string;
  description?: string;
  // Gates progressive choices (e.g. Eldritch Invocations); a picked option stays visible
  // even if the prerequisite is later lost, so the player can remove it.
  prerequisite?: { level?: number; selections?: string[] };
  effects?: TraitEffect[];
  grants?: TraitGrant[];
}

// Absent entirely = passive feature (not shown in the Actions tab).
export type ActionActivation = 'action' | 'bonus_action' | 'reaction' | 'free';

export interface TraitAction {
  activation: ActionActivation;
  uses?: {
    max: number;
    maxByLevel?: Record<string, number>;
    // Uses equal the named ability modifier (subject to `minimum`) when ability
    // scores are available; `max` remains the safe fallback for older callers.
    maxAbilityModifier?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
    minimum?: number;
    per: 'short_rest' | 'long_rest';
    // Some pools change recovery cadence without becoming a second resource.
    perByLevel?: Record<string, 'short_rest' | 'long_rest'>;
    // Some long-rest pools regain a fixed number of uses on a Short Rest (for example Rage).
    shortRestRestore?: number;
  };
}

export type TraitGrant =
  // `key` is only required with `action` — it's the stable id usage is tracked against
  // (Character.resource_uses); `name` can be reworded freely without breaking saves.
  | { type: 'feature'; name: string; description?: string; key?: string; action?: TraitAction; effects?: TraitEffect[] }
  // `chooseByLevel` grows the pool with class level (key = level, value = total choices).
  | { type: 'choice'; key: string; name: string; choose: number; chooseByLevel?: Record<string, number>; description?: string; options: TraitOption[] }
  // `skills` restricts to a named list (e.g. Elf's Keen Senses); omitted = any skill (Human's Skillful).
  | { type: 'skill_choice'; key: string; name: string; choose: number; description?: string; skills?: string[] }
  // Choose existing skill proficiencies whose proficiency bonus is doubled. Options are derived
  // from the character's live proficient-skill set; `skills` optionally narrows the eligible set.
  | { type: 'expertise_choice'; key: string; name: string; choose: number; description?: string; skills?: string[] }
  // Options are derived from weapon items (DndItem.mastery) the class is proficient with,
  // filtered by category, rather than embedded here.
  | { type: 'weapon_mastery'; key: string; name: string; choose: number; description?: string; proficiency: string[] }
  // Distribute `points` across abilities (max +2 each, 20 cap) — e.g. ASI (all 6 abilities) or
  // a Background's origin boost (3 points, restricted `abilities`). `key` must be unique per
  // occurrence ("asi_4", "asi_8"). `allowFeat` (class ASI only) lets the player take a feat
  // instead, stored under `${key}:feat` (plus `${key}:feat_ability` if that feat offers a
  // choice of ability); `feats` restricts which feats are offered.
  | { type: 'ability_choice'; key: string; name: string; description?: string; points: number; abilities?: string[]; allowFeat?: boolean; feats?: string[] }
  // Pure feat picker from the Feats library, filtered to `category` (and optionally `feats`) —
  // e.g. a class's Fighting Style feature. No ASI alternative. `excludeKey` points at another
  // feat_pick/ability_choice grant whose picks should be excluded (e.g. Fighter's Additional
  // Fighting Style must differ from the one picked at level 1).
  | { type: 'feat_pick'; key: string; name: string; choose: number; description?: string; category: 'origin' | 'general' | 'fighting_style' | 'epic'; feats?: string[]; excludeKey?: string }
  // Fixed or selectable spells granted by a species, class, subclass, feat, or another option.
  // Class/subclass grants inherit that class's spellcasting source unless `sourceKey` is set.
  | {
      type: 'spell_grant'; key: string; name: string; description?: string;
      destination: 'known' | 'spellbook' | 'always_prepared';
      spells?: string[]; choose?: number; countsAgainstLimit?: boolean;
      sourceKey?: string; sourceName?: string; list?: string;
      ability?: SpellcastingAbility;
      characterLevel?: number; classLevel?: number;
      fromDestination?: 'known' | 'spellbook' | 'prepared';
      freeCast?: {
        uses?: number | 'proficiency_bonus' | 'spellcasting_ability_modifier';
        usesByClassLevel?: Record<string, number>;
        minimum?: number;
        recovery?: 'short_rest' | 'long_rest';
        atWill?: boolean;
        slotLevel?: number;
      };
      filter?: {
        lists?: string[]; schools?: string[]; minLevel?: number; maxLevel?: number;
        exactLevels?: number[]; ritual?: boolean; spellAttack?: boolean; castingTimes?: string[];
      };
    }
  // Adds spells to the active class source without creating a second slot pool. This is used
  // by subclasses such as Divine Soul whose spell choices come from an additional class list.
  | {
      type: 'spell_list_expansion'; key: string; name: string;
      spells?: string[]; list?: string; description?: string;
    };

export type SpellcastingAbility =
  | 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'
  | { choiceKey: string };

export interface SpellcastingDefinition {
  key: string;
  name?: string;
  list: string;
  spells: string[];
  ability: SpellcastingAbility;
  mode: 'prepared' | 'known' | 'spellbook';
  progression: 'full' | 'half' | 'third' | 'pact';
}

export interface DndFeat {
  index: string;
  name: string;
  description: string;
  // Origin feats come from Background/Human's Versatile at creation, never the ASI-or-feat
  // pool. Fighting Style feats only come through a class's `feat_pick`. Only General feats
  // populate the ASI-or-feat pool. Epic feats (Epic Boons) come via a level-19 `feat_pick`.
  category: 'origin' | 'general' | 'fighting_style' | 'epic';
  // Used to filter a feat picker to feats the character qualifies for. `abilities` is an OR
  // list (any one at `min`, default 13, qualifies). `feature`/`classes` gate class-restricted
  // Fighting Style feats (e.g. Paladin's Blessed Warrior needs the Fighting Style feature).
  prerequisite?: {
    level?: number;
    abilities?: string[];
    min?: number; // ability score threshold for `abilities`; defaults to 13 if omitted
    armorProficiency?: 'light' | 'medium' | 'heavy' | 'shield';
    spellcasting?: boolean;
    feature?: string;
    classes?: string[];
    species?: string[];
    speciesChoices?: Record<string, string[]>;
  };
  // Mechanical grants applied automatically to computed stats. Most General feats give a flat
  // or player-chosen +1 ability (max 20); `abilities.length > 1` means the player picks which.
  // `grantsSaveProficiency` (Resilient) adds save proficiency in the increased ability.
  // Fighting Style / proficiency feats instead carry `effects` (same TraitEffect shape as a
  // class `choice` option).
  abilityIncrease?: { abilities: string[]; amount: number; grantsSaveProficiency?: boolean };
  effects?: TraitEffect[];
  // Choices granted by the feat itself (for example Skilled's three proficiencies). These use
  // the same data-driven grant shapes as races, classes, and backgrounds.
  grants?: TraitGrant[];
  // Whether the feat can be taken more than once. Most can't — only set per the book. Feat
  // pickers exclude non-repeatable feats the character already has.
  repeatable?: boolean;
  source?: DndSourceReference;
}

export interface ClassLevel {
  level: number;
  proficiency_bonus: number;
  features: string[];
  grants?: TraitGrant[];
  spell_slots?: SpellSlots;
  pact_magic?: { slots: number; slot_level: number };
  cantrips_known?: number;
  spells_known?: number;
  prepared_spells?: number;
  class_specific?: Record<string, number | string>;
}

export interface Subclass {
  index: string;
  name: string;
  description?: string;
  source?: DndSourceReference;
  spellcasting?: SpellcastingDefinition;
  // Same shape as ClassLevel; `features` is the legacy flat fallback for subclasses not yet restructured.
  levels: {
    level: number;
    features: string[];
    grants?: TraitGrant[];
    spell_slots?: SpellSlots;
    pact_magic?: { slots: number; slot_level: number };
    cantrips_known?: number;
    spells_known?: number;
    prepared_spells?: number;
  }[];
}

export interface DndClass {
  index: string;
  name: string;
  description?: string;
  primary_abilities?: string[];
  hit_die: number;
  saving_throws: string[];
  armor_training: string[];
  weapon_proficiencies: string[];
  tool_proficiencies: string[];
  skill_choices: { count: number; from: string[] };
  starting_equipment: StartingEquipment;
  spellcasting_ability?: string | null;
  spellcasting?: SpellcastingDefinition;
  subclass_level: number;
  subclasses: Subclass[];
  levels: ClassLevel[];
  source?: DndSourceReference;
}

export interface DndRace {
  index: string;
  name: string;
  description?: string;
  creature_type: string;
  speed: number;
  // Feet, only present for races that actually grant it (SRD standard is 60ft, Dwarf/Orc 120ft).
  // See Character.darkvision_ft for the per-character override this feeds as a default.
  darkvision_ft?: number;
  size: string;
  size_options?: string[];
  // No ability_bonuses — species don't grant ASIs (see DndBackground.grants instead).
  // Legacy flat fallback for races not yet restructured — see `grants`.
  traits: string[];
  // Same shape as a class level's grants; a skill_choice can restrict to a list or allow any skill.
  grants?: TraitGrant[];
  languages: string[];
  subraces: {
    index: string;
    name: string;
    description?: string;
    traits: string[];
    grants?: TraitGrant[];
  }[];
  source?: DndSourceReference;
}

export interface DndBackground {
  index: string;
  name: string;
  description?: string;
  skill_proficiencies: string[];
  tool_proficiencies: string[];
  languages: string;
  starting_equipment: StartingEquipment;
  feature: string;
  // Ability score increase lives here, not on race — see TraitGrant's 'ability_choice'.
  // Always a single grant: 3 points, restricted to this background's 3 relevant abilities.
  grants?: TraitGrant[];
  source?: DndSourceReference;
}

// One equipment grant: either a specific catalog item, or "any item whose category starts with
// X" (player picks which, same idea as weapon_mastery). Each ref has its own stable `key` so a
// category pick can be stored/looked up directly, whether it lives in `fixed` or a group option.
export type EquipmentItemRef =
  | { key: string; item: string; quantity?: number }
  | { key: string; category: string; label: string; quantity?: number };

export interface EquipmentOption {
  key: string;    // stable id for this alternative within its group, e.g. "chain_mail"
  label: string;  // display text, e.g. "Leather Armor, a Longbow, and 20 Arrows"
  items: EquipmentItemRef[];
  // gp bundled with THIS option specifically — classes often offer multiple full, independently
  // priced gear packages, each with its own leftover gold (unlike the flat `StartingEquipment.gold`).
  gold?: number;
}

// One PHB equipment line offering interchangeable alternatives — pick exactly one option.
// E.g. Fighter's "(a) chain mail or (b) leather armor, a longbow, and 20 arrows".
export interface EquipmentGroup {
  key: string;
  options: EquipmentOption[];
}

// PHB option A (`fixed` + one pick per `groups`, plus bundled `gold`) vs option B
// (`goldAlternative`, a flat sum instead of gear).
export interface StartingEquipment {
  fixed: EquipmentItemRef[];
  groups: EquipmentGroup[];
  gold: number;
  goldAlternative: number;
}

export interface DndItem {
  index: string;
  name: string;
  type: 'weapon' | 'armor' | 'gear' | 'consumable' | string;
  category: string;
  damage?: string | null;
  damage_type?: string | null;
  armor_class?: string;
  properties: string[];
  weight: number;
  cost: string;
  description: string;
  mastery?: { property: string; description: string };
  rarity?: string;
  requires_attunement?: boolean | string;
  charges?: { max: number; recovery: 'dawn' | 'short_rest' | 'long_rest' };
  source?: DndSourceReference;
}

export interface DndSpell {
  index: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string[];
  material?: string;
  material_cost_cp?: number;
  material_consumed?: boolean;
  duration: string;
  ritual: boolean;
  concentration: boolean;
  access: DndSpellAccess[];
  mechanics: {
    spell_attacks?: string[];
    saving_throws: string[];
    ability_checks: string[];
    damage_types: string[];
    conditions: string[];
    affects_creature_types: string[];
    grants_damage_immunities: string[];
    grants_damage_resistances: string[];
    grants_damage_vulnerabilities: string[];
    grants_condition_immunities: string[];
    area_tags: string[];
    misc_tags: string[];
    scaling?: { label: string; values: Record<string, string> };
  };
  description: string;
  higher_levels?: string;
  cantrip_upgrade?: string;
  source: DndSourceReference;
}

export interface DndSpellAccess {
  kind: 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'class_feature';
  provider_index: string;
  provider_name: string;
  parent_name?: string;
  detail?: string;
  source_code?: string;
  mode: 'list' | 'grant' | 'choice';
}

export interface DndMonster {
  index: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  // Default token color for this monster type, set in the monster wizard — a per-encounter
  // override in dm-encounter-play.ts still takes priority when one's been chosen live.
  color?: string;
  armor_class: number;
  armor_class_desc?: string;
  hit_points: number;
  hit_dice: string;
  speed: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number };
  ability_scores: {
    strength: number; dexterity: number; constitution: number;
    intelligence: number; wisdom: number; charisma: number;
  };
  saving_throws?: Record<string, number>;
  skills?: Record<string, number>;
  damage_vulnerabilities?: string[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: string[];
  senses: {
    darkvision?: number; blindsight?: number; truesight?: number; tremorsense?: number;
    passive_perception: number;
  };
  languages: string[];
  challenge_rating: string;
  xp: number;
  traits?: { name: string; description: string }[];
  actions: { name: string; description: string }[];
  reactions?: { name: string; description: string }[];
  legendary_actions?: { name: string; description: string }[];
  description?: string;
  source?: DndSourceReference;
}

export type CustomContentKind = 'monsters' | 'items' | 'spells';

@Injectable({ providedIn: 'root' })
export class ContentService {
  private cache = new Map<string, unknown>();
  private tokens = inject(AuthTokenService);

  private async get<T>(path: string): Promise<T> {
    if (this.cache.has(path)) return this.cache.get(path) as T;
    const token = this.tokens.accessToken();
    const res = await fetch(`${API}/content/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to load content: ${path}`);
    const data = await res.json() as T;
    this.cache.set(path, data);
    return data;
  }

  // This cache never expires on its own — anything that writes custom content outside this
  // service (MonsterService/ItemService/SpellService create/update/delete) has to call this
  // afterward, or callers keep seeing stale data for the rest of the SPA session. Cache keys vary
  // by campaignId (`monsters` vs `monsters?campaignId=X`), so invalidation clears every key for
  // that content kind rather than tracking each campaignId that's been queried.
  invalidateContent(kind: CustomContentKind, index?: string) {
    for (const key of [...this.cache.keys()]) {
      if (key === kind || key.startsWith(`${kind}?`) || (index && key === `${kind}/${index}`)) {
        this.cache.delete(key);
      }
    }
  }

  getSources()                      { return this.get<DndContentSource[]>('sources'); }
  getClasses()                      { return this.get<DndClass[]>('classes'); }
  getClass(index: string)           { return this.get<DndClass>(`classes/${index}`); }
  getRaces()                        { return this.get<DndRace[]>('races'); }
  getRace(index: string)            { return this.get<DndRace>(`races/${index}`); }
  getBackgrounds()                  { return this.get<DndBackground[]>('backgrounds'); }
  getBackground(index: string)      { return this.get<DndBackground>(`backgrounds/${index}`); }
  getItems(campaignId?: string)     { return this.get<DndItem[]>(`items${campaignId ? `?campaignId=${campaignId}` : ''}`); }
  getItem(index: string)            { return this.get<DndItem>(`items/${index}`); }
  getSpells(campaignId?: string)    { return this.get<DndSpell[]>(`spells${campaignId ? `?campaignId=${campaignId}` : ''}`); }
  getSpellLists()                   { return this.get<Record<string, string[]>>('spell-lists'); }
  getSpell(index: string)           { return this.get<DndSpell>(`spells/${index}`); }
  getFeats()                        { return this.get<DndFeat[]>('feats'); }
  getFeat(index: string)            { return this.get<DndFeat>(`feats/${index}`); }
  getMonsters(campaignId?: string)  { return this.get<DndMonster[]>(`monsters${campaignId ? `?campaignId=${campaignId}` : ''}`); }
  getMonster(index: string)         { return this.get<DndMonster>(`monsters/${index}`); }
}
