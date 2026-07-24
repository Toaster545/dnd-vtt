import { Injectable } from '@angular/core';

const BASE = 'https://www.dnd5eapi.co/api/2014';

export interface Dnd5eRace {
  index: string;
  name: string;
  speed: number;
  size: string;
  ability_bonuses: { ability_score: { index: string; name: string }; bonus: number }[];
  subraces: { index: string; name: string }[];
  traits: { index: string; name: string }[];
}

export interface Dnd5eSubrace {
  index: string;
  name: string;
  race: { index: string; name: string };
  ability_bonuses: { ability_score: { index: string; name: string }; bonus: number }[];
}

export interface Dnd5eClass {
  index: string;
  name: string;
  hit_die: number;
  saving_throws: { index: string; name: string }[];
  subclasses: { index: string; name: string }[];
  spellcasting?: { spellcasting_ability: { index: string; name: string } };
}

export interface Dnd5eBackground {
  index: string;
  name: string;
  skill_proficiencies: string[];
}

// Ability index from API ("str","dex","con","int","wis","cha") → our Ability key
export const ABILITY_INDEX_MAP: Record<string, string> = {
  str: 'strength', dex: 'dexterity', con: 'constitution',
  int: 'intelligence', wis: 'wisdom', cha: 'charisma',
};

// PHB subclasses hard-coded — SRD only includes one per class
const PHB_SUBCLASSES: Record<string, string[]> = {
  barbarian: ['Path of the Berserker', 'Path of the Totem Warrior'],
  bard:      ['College of Lore', 'College of Valor'],
  cleric:    ['Life Domain', 'Light Domain', 'Nature Domain', 'Knowledge Domain', 'Tempest Domain', 'Trickery Domain', 'War Domain'],
  druid:     ['Circle of the Land', 'Circle of the Moon'],
  fighter:   ['Champion', 'Battle Master', 'Eldritch Knight', 'Psi Warrior'],
  monk:      ['Way of the Open Hand', 'Way of Shadow', 'Way of the Four Elements'],
  paladin:   ['Oath of Devotion', 'Oath of the Ancients', 'Oath of Vengeance'],
  ranger:    ['Hunter', 'Beast Master'],
  rogue:     ['Thief', 'Assassin', 'Arcane Trickster'],
  sorcerer:  ['Draconic Bloodline', 'Wild Magic'],
  warlock:   ['The Archfey', 'The Fiend', 'The Great Old One'],
  wizard:    ['School of Abjuration', 'School of Conjuration', 'School of Divination', 'School of Enchantment', 'School of Evocation', 'School of Illusion', 'School of Necromancy', 'School of Transmutation'],
};

// PHB backgrounds hard-coded (SRD only has Acolyte; the rest are stable PHB content)
const PHB_BACKGROUNDS: Dnd5eBackground[] = [
  { index: 'acolyte',      name: 'Acolyte',      skill_proficiencies: ['Insight', 'Religion'] },
  { index: 'charlatan',    name: 'Charlatan',    skill_proficiencies: ['Deception', 'Sleight of Hand'] },
  { index: 'criminal',     name: 'Criminal',     skill_proficiencies: ['Deception', 'Stealth'] },
  { index: 'entertainer',  name: 'Entertainer',  skill_proficiencies: ['Acrobatics', 'Performance'] },
  { index: 'folk-hero',    name: 'Folk Hero',    skill_proficiencies: ['Animal Handling', 'Survival'] },
  { index: 'guild-artisan',name: 'Guild Artisan',skill_proficiencies: ['Insight', 'Persuasion'] },
  { index: 'hermit',       name: 'Hermit',       skill_proficiencies: ['Medicine', 'Religion'] },
  { index: 'noble',        name: 'Noble',        skill_proficiencies: ['History', 'Persuasion'] },
  { index: 'outlander',    name: 'Outlander',    skill_proficiencies: ['Athletics', 'Survival'] },
  { index: 'sage',         name: 'Sage',         skill_proficiencies: ['Arcana', 'History'] },
  { index: 'sailor',       name: 'Sailor',       skill_proficiencies: ['Athletics', 'Perception'] },
  { index: 'soldier',      name: 'Soldier',      skill_proficiencies: ['Athletics', 'Intimidation'] },
  { index: 'urchin',       name: 'Urchin',       skill_proficiencies: ['Sleight of Hand', 'Stealth'] },
];

@Injectable({ providedIn: 'root' })
export class Dnd5eService {
  private cache = new Map<string, unknown>();

  private async get<T>(path: string): Promise<T> {
    if (this.cache.has(path)) return this.cache.get(path) as T;
    const res = await fetch(`${BASE}${path}`);
    const data = await res.json() as T;
    this.cache.set(path, data);
    return data;
  }

  async getRaces(): Promise<Dnd5eRace[]> {
    const list = await this.get<{ results: { index: string }[] }>('/races');
    return Promise.all(list.results.map(r => this.get<Dnd5eRace>(`/races/${r.index}`)));
  }

  async getSubrace(index: string): Promise<Dnd5eSubrace> {
    return this.get<Dnd5eSubrace>(`/subraces/${index}`);
  }

  async getClasses(): Promise<Dnd5eClass[]> {
    const list = await this.get<{ results: { index: string }[] }>('/classes');
    const classes = await Promise.all(list.results.map(c => this.get<Dnd5eClass>(`/classes/${c.index}`)));
    return classes.map(c => ({
      ...c,
      subclasses: (PHB_SUBCLASSES[c.index] ?? c.subclasses.map(s => s.name))
        .map(name => ({ index: name.toLowerCase().replace(/\s+/g, '-'), name })),
    }));
  }

  getBackgrounds(): Dnd5eBackground[] {
    return PHB_BACKGROUNDS;
  }
}
