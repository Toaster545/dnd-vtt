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

export interface Character {
  id?: string;
  user_id?: string;
  name: string;
  race: string;
  class: string;
  subclass?: string;
  level: number;
  background: string;
  alignment: string;
  ability_scores: AbilityScores;
  max_hp: number;
  current_hp: number;
  armor_class: number;
  speed: number;
  proficiency_bonus: number;
  skills: Record<string, boolean>;
  equipment: string[];
  spells: string[];
  notes: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
