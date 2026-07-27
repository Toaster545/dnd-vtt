import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface SpellSlots {
  '1'?: number; '2'?: number; '3'?: number; '4'?: number; '5'?: number;
  '6'?: number; '7'?: number; '8'?: number; '9'?: number;
}

// Machine-readable mechanical effect of a chosen option, so calculations (AC, damage, etc.)
// can be derived generically instead of matching on the option's display name.
export interface TraitEffect {
  type: string; // e.g. 'ac_bonus' | 'melee_damage_bonus' | 'ranged_attack_bonus' | 'armor_proficiency' | 'weapon_proficiency' | 'tool_proficiency' | 'special'
  value?: number;
  values?: number[];
  tags?: string[];
  condition?: EffectCondition;
}

export type EffectCondition =
  | 'wearing_armor'
  | 'no_armor'
  | 'wielding_shield'
  | 'two_handed_melee'
  | 'one_handed_melee_no_offhand'
  | 'dual_wielding_melee';

export interface TraitOption {
  name: string;
  description?: string;
  effect?: TraitEffect;
}

// How a feature is used at the table, and its resource pool if it's limited-use.
// Absent entirely = passive (nothing to track, doesn't belong in an Actions tab).
export type ActionActivation = 'action' | 'bonus_action' | 'reaction' | 'free';

export interface TraitAction {
  activation: ActionActivation;
  uses?: { max: number; per: 'short_rest' | 'long_rest' };
}

export type TraitGrant =
  // `key` is only required when `action` is present — it's the stable id usage is tracked
  // against (Character.resource_uses), since `name` can be reworded without breaking saves.
  | { type: 'feature'; name: string; description?: string; key?: string; action?: TraitAction }
  | { type: 'choice'; key: string; name: string; choose: number; description?: string; options: TraitOption[] }
  | { type: 'skill_choice'; key: string; name: string; choose: number; description?: string }
  // Options aren't embedded — they're derived from weapon items (DndItem.mastery) the
  // class is proficient with, filtered by category, so the weapon/mastery data stays
  // in one place and every class that grants Weapon Mastery shares it.
  | { type: 'weapon_mastery'; key: string; name: string; choose: number; description?: string; proficiency: string[] }
  // Distribute `points` across ability scores (max +2 to any single ability per grant, and
  // capped at 20 total) rather than picking from a named option list — e.g. Ability Score
  // Improvement (class, all 6 abilities eligible) or a Background's origin ability boost
  // (points: 3, `abilities` restricted to that background's 3 relevant scores). `key` must be
  // unique per occurrence (e.g. "asi_4", "asi_8"), not shared across levels the way a scaling
  // resource like Action Surge is. When `allowFeat` is set (class ASI only), the player may
  // take a feat instead of the ability increase — stored under a companion trait key,
  // `${key}:feat`, holding the chosen feat's index (and `${key}:feat_ability` if that feat's
  // own ability bonus has more than one eligible ability); `feats` optionally restricts the list.
  | { type: 'ability_choice'; key: string; name: string; description?: string; points: number; abilities?: string[]; allowFeat?: boolean; feats?: string[] }
  // A pure feat picker sourced from the Feats content library, filtered to `category` (and
  // optionally further restricted to `feats`) — e.g. a class's Fighting Style feature. No ASI
  // alternative (unlike `ability_choice`). `excludeKey` points at another feat_pick/ability_choice
  // grant's key whose already-picked feat(s) should be excluded from this one's options (e.g.
  // Fighter's Additional Fighting Style must differ from the style picked at level 1).
  | { type: 'feat_pick'; key: string; name: string; choose: number; description?: string; category: 'origin' | 'general' | 'fighting_style' | 'epic'; feats?: string[]; excludeKey?: string };

export interface DndFeat {
  index: string;
  name: string;
  description: string;
  // Origin feats come from Background (or Human's Versatile trait) at character creation —
  // they never belong in the level 4+ ASI-or-feat pool. Fighting Style feats are only ever
  // offered through a class's Fighting Style feature (see `feat_pick` grants), never the
  // general ASI-or-feat pool either. Only General feats populate that pool. Epic feats
  // (Epic Boons) are likewise only ever offered through a dedicated `feat_pick` grant at
  // level 19 — they carry `prerequisite.level: 19` mostly for informational completeness,
  // same as General feats carrying `level: 4`.
  category: 'origin' | 'general' | 'fighting_style' | 'epic';
  // "For which you qualify" — a feat picker should only offer feats the character actually
  // meets. `abilities` is an OR list (any one of these at `min` qualifies); level is always 4
  // for every current General feat (the earliest this slot appears) so it's carried for
  // completeness rather than actively gated on. `feature`/`classes` gate Fighting Style feats
  // that are class-restricted (e.g. Blessed Warrior requires the Paladin's Fighting Style
  // feature) — `feature` is informational (the grant context already implies it), `classes` is
  // actively checked against the character's selected classes.
  prerequisite?: {
    level?: number;
    abilities?: string[];
    min?: number; // ability score threshold for `abilities`; defaults to 13 if omitted
    armorProficiency?: 'light' | 'medium' | 'heavy' | 'shield';
    spellcasting?: boolean;
    feature?: string;
    classes?: string[];
  };
  // Mechanical grants baked into taking the feat itself, applied automatically to computed
  // stats — independent of `prerequisite` (which is about qualifying to take it) and of each
  // other (a feat can carry both, or either alone). Most General feats give a flat or
  // player-chosen +1 to one ability (max 20); `abilities.length > 1` means the player picks
  // which. `grantsSaveProficiency` is for the Resilient pattern — the character also gains
  // saving-throw proficiency in whichever ability was increased (the player-chosen one, when
  // there's a choice), not a separately-chosen ability. Fighting Style and proficiency-granting
  // feats instead (or additionally) carry `effects`, the same TraitEffect shape a class `choice`
  // option uses — combat bonuses (AC, damage, attack rolls, etc.), optionally gated by
  // `condition`, plus fixed proficiency grants (`armor_proficiency`/`weapon_proficiency`/
  // `tool_proficiency`, kind(s) in `tags`).
  abilityIncrease?: { abilities: string[]; amount: number; grantsSaveProficiency?: boolean };
  effects?: TraitEffect[];
  // Whether this feat can be taken more than once (stacking each time) — per the PHB, most
  // feats can't; only mark this when the book explicitly says so. Non-repeatable feats already
  // taken (via any ASI-or-feat/feat_pick slot on the character) are excluded from feat pickers.
  repeatable?: boolean;
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
  class_specific?: Record<string, number | string>;
}

export interface Subclass {
  index: string;
  name: string;
  description?: string;
  // Same shape as ClassLevel — a subclass level can carry structured grants (feature/choice/
  // skill_choice/weapon_mastery) exactly like a base class level, so it gets the same
  // description/options/collapse/indicator treatment once rendered. `features` stays as the
  // legacy flat fallback for subclasses not yet restructured.
  levels: { level: number; features: string[]; grants?: TraitGrant[] }[];
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
  spellcasting_ability?: string;
  subclass_level: number;
  subclasses: Subclass[];
  levels: ClassLevel[];
}

export interface DndRace {
  index: string;
  name: string;
  description?: string;
  speed: number;
  size: string;
  // No ability_bonuses — species don't grant ability score increases (that comes from
  // Background instead). See DndBackground.grants.
  // Legacy flat fallback for races not yet restructured — see `grants`.
  traits: string[];
  // Same shape as a class level's grants (feature/choice — skill_choice and weapon_mastery
  // aren't used here since races don't have a class-style skill_choices table or weapon
  // proficiency list to derive them from; races needing a skill/weapon pick use a
  // self-contained 'choice' grant with its own embedded options instead).
  grants?: TraitGrant[];
  languages: string[];
  subraces: {
    index: string;
    name: string;
    description?: string;
    traits: string[];
    grants?: TraitGrant[];
  }[];
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
  // Ability score increase now lives here rather than on race — see TraitGrant's
  // 'ability_choice' variant. Always a single grant: 3 points, restricted to this
  // background's 3 relevant abilities.
  grants?: TraitGrant[];
}

// A single concrete item grant within starting equipment — either a specific catalog item, or
// "any item whose category starts with X" (the player then picks which one, same idea as
// `weapon_mastery`'s category-filtered picker). Every ref carries its own stable `key` so a
// category pick can be stored/looked-up directly, regardless of whether the ref lives loose in
// `fixed` or nested inside a group option.
export type EquipmentItemRef =
  | { key: string; item: string; quantity?: number }
  | { key: string; category: string; label: string; quantity?: number };

export interface EquipmentOption {
  key: string;    // stable id for this alternative within its group, e.g. "chain_mail"
  label: string;  // display text, e.g. "Leather Armor, a Longbow, and 20 Arrows"
  items: EquipmentItemRef[];
  // gp bundled with THIS option specifically — classes typically offer two full,
  // independently-priced-out gear packages (e.g. Fighter's "Chain Mail... and 4 GP" vs
  // "Studded Leather... and 11 GP"), each with its own leftover gold, unlike the flat
  // `StartingEquipment.gold` alongside a single `fixed` set (background pattern).
  gold?: number;
}

// One PHB equipment line that offers a handful of interchangeable alternatives — pick exactly
// one option. E.g. Fighter's "(a) chain mail or (b) leather armor, a longbow, and 20 arrows".
export interface EquipmentGroup {
  key: string;
  options: EquipmentOption[];
}

// A class or background's starting gear (option "a" in PHB terms: `fixed` + one pick per
// `groups`, plus `gold` bundled alongside it, e.g. Soldier's "...with 10 gp") versus a flat
// gold sum instead of all of it (option "b": `goldAlternative`).
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
}

export interface DndSpell {
  index: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string[];
  duration: string;
  classes: string[];
  description: string;
}

export interface DndMonster {
  index: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
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
}

@Injectable({ providedIn: 'root' })
export class ContentService {
  private cache = new Map<string, unknown>();

  private async get<T>(path: string): Promise<T> {
    if (this.cache.has(path)) return this.cache.get(path) as T;
    const res = await fetch(`${API}/content/${path}`);
    if (!res.ok) throw new Error(`Failed to load content: ${path}`);
    const data = await res.json() as T;
    this.cache.set(path, data);
    return data;
  }

  getClasses()                      { return this.get<DndClass[]>('classes'); }
  getClass(index: string)           { return this.get<DndClass>(`classes/${index}`); }
  getRaces()                        { return this.get<DndRace[]>('races'); }
  getRace(index: string)            { return this.get<DndRace>(`races/${index}`); }
  getBackgrounds()                  { return this.get<DndBackground[]>('backgrounds'); }
  getBackground(index: string)      { return this.get<DndBackground>(`backgrounds/${index}`); }
  getItems()                        { return this.get<DndItem[]>('items'); }
  getItem(index: string)            { return this.get<DndItem>(`items/${index}`); }
  getSpells()                       { return this.get<DndSpell[]>('spells'); }
  getSpell(index: string)           { return this.get<DndSpell>(`spells/${index}`); }
  getFeats()                        { return this.get<DndFeat[]>('feats'); }
  getFeat(index: string)            { return this.get<DndFeat>(`feats/${index}`); }
  getMonsters()                     { return this.get<DndMonster[]>('monsters'); }
  getMonster(index: string)         { return this.get<DndMonster>(`monsters/${index}`); }
}
