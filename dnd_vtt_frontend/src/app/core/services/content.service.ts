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
  type: string; // e.g. 'ac_bonus' | 'melee_damage_bonus' | 'ranged_attack_bonus' | 'special'
  value?: number;
  values?: number[];
}

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
  // `${key}:feat`, holding the chosen feat's index; `feats` optionally restricts the list.
  | { type: 'ability_choice'; key: string; name: string; description?: string; points: number; abilities?: string[]; allowFeat?: boolean; feats?: string[] };

export interface DndFeat {
  index: string;
  name: string;
  description: string;
  // Origin feats come from Background (or Human's Versatile trait) at character creation —
  // they never belong in the level 4+ ASI-or-feat pool, only General feats do.
  category: 'origin' | 'general';
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
  starting_equipment: ({ choice: true; options: string[] } | { fixed: string[] })[];
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
  starting_equipment: string[];
  feature: string;
  // Ability score increase now lives here rather than on race — see TraitGrant's
  // 'ability_choice' variant. Always a single grant: 3 points, restricted to this
  // background's 3 relevant abilities.
  grants?: TraitGrant[];
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
}
