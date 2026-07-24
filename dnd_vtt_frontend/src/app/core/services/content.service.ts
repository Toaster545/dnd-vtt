import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface SpellSlots {
  '1'?: number; '2'?: number; '3'?: number; '4'?: number; '5'?: number;
  '6'?: number; '7'?: number; '8'?: number; '9'?: number;
}

export interface ClassLevel {
  level: number;
  proficiency_bonus: number;
  features: string[];
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
  levels: { level: number; features: string[] }[];
}

export interface DndClass {
  index: string;
  name: string;
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
  speed: number;
  size: string;
  ability_bonuses: { ability: string; bonus: number }[];
  traits: string[];
  languages: string[];
  subraces: {
    index: string;
    name: string;
    ability_bonuses: { ability: string; bonus: number }[];
    traits: string[];
  }[];
}

export interface DndBackground {
  index: string;
  name: string;
  skill_proficiencies: string[];
  tool_proficiencies: string[];
  languages: string;
  starting_equipment: string[];
  feature: string;
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
}
