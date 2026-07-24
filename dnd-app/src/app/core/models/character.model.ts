export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

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
