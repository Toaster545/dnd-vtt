export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export type Ability = keyof AbilityScores;

export const ABILITIES: Ability[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];

export const ABILITY_SHORT: Record<Ability, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

export const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export const SKILLS: Record<string, Ability> = {
  'Acrobatics': 'dexterity',    'Animal Handling': 'wisdom',  'Arcana': 'intelligence',
  'Athletics': 'strength',       'Deception': 'charisma',      'History': 'intelligence',
  'Insight': 'wisdom',           'Intimidation': 'charisma',   'Investigation': 'intelligence',
  'Medicine': 'wisdom',          'Nature': 'intelligence',      'Perception': 'wisdom',
  'Performance': 'charisma',     'Persuasion': 'charisma',     'Religion': 'intelligence',
  'Sleight of Hand': 'dexterity','Stealth': 'dexterity',       'Survival': 'wisdom',
};

export interface EquipmentEntry {
  itemIndex: string;
  name: string;
  quantity: number;
  equipped: boolean;
}

export interface SpellEntry {
  spellIndex: string;
  name: string;
  prepared: boolean;
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface Character {
  id?: string;
  user_id?: string;

  // Identity (reference content by name)
  name: string;
  race: string;
  class: string;
  subclass?: string;
  level: number;
  background: string;
  alignment: string;

  // Raw ability scores — never computed, always stored
  ability_scores: AbilityScores;

  // HP — max_hp stored so players can override auto-calc (rolled HP, feats, etc.)
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  hit_dice_used: number;
  death_saves: DeathSaves;
  conditions: string[];

  // AC and speed stored — too many modifiers to purely compute
  armor_class: number;
  speed: number;

  // Proficiencies — class defaults computed at runtime, player choices stored here
  skills: Record<string, boolean>;
  expertise: Record<string, boolean>;

  // Inventory
  equipment: EquipmentEntry[];
  currency: Currency;

  // Spells
  spells: SpellEntry[];
  spell_slots_used: Record<string, number>; // slot level → count used

  // Flavor
  personality_traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  notes: string;

  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

export function defaultCharacter(): Omit<Character, 'name'> {
  return {
    race: '', class: '', level: 1, background: '', alignment: 'True Neutral',
    ability_scores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    max_hp: 10, current_hp: 10, temp_hp: 0, hit_dice_used: 0,
    death_saves: { successes: 0, failures: 0 },
    conditions: [],
    armor_class: 10, speed: 30,
    skills: {}, expertise: {},
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: [], spell_slots_used: {},
    personality_traits: '', ideals: '', bonds: '', flaws: '', notes: '',
  };
}
