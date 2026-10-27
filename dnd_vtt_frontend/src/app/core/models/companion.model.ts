export interface CompanionAction {
  key: string;
  name: string;
  activation: 'action' | 'bonus_action' | 'reaction';
  description: string;
  attack_bonus?: number;
  damage?: string;
  damage_type?: string;
  reach?: number;
  attacks?: number;
  uses?: number;
  used?: number;
  basic?: boolean;
}
export interface Companion {
  id: string;
  character_id: string;
  kind: 'primal' | 'steel';
  form: string;
  name: string;
  status: 'active' | 'dead' | 'dismissed';
  portrait_image?: string;
  died_at?: string;
  temp_hp: number;
  damage: number;
  conditions: string[];
  hit_dice_used: number;
  resource_uses: Record<string, number>;
  revision: number;
  replacement_available?: boolean;
  turn: {
    ownerTurn: boolean;
    started: boolean;
    command?: string;
    commandCost?: string;
    actionUsed?: boolean;
    bonusUsed?: boolean;
    reactionUsed?: boolean;
    joltUsed?: boolean;
  } | null;
  stats: {
    name: string;
    source: string;
    version: number;
    eligible: boolean;
    class_level: number;
    size: string;
    type: string;
    alignment?: string;
    armor_class: number;
    max_hp: number;
    current_hp: number;
    hit_die: number;
    hit_dice: number;
    ability_scores: Record<string, number>;
    saving_throws: Record<string, number>;
    check_bonus: number;
    passive_perception: number;
    speed: Record<string, number>;
    darkvision: number;
    languages: string;
    damage_immunities: string[];
    condition_immunities: string[];
    traits: { name: string; description: string }[];
    actions: CompanionAction[];
    command: {
      timing: string;
      defaultAction: string;
      replaceAttack: boolean;
      exceptionalTraining: boolean;
    };
  };
}
export interface CompanionResponse {
  companions: Companion[];
  options: {
    kind: 'primal' | 'steel';
    name: string;
    forms: string[];
    source: string;
    version: number;
  }[];
  context: { encounterId: string; ownerTurn: boolean; started: boolean } | null;
  slots: { poolKey: string; name: string; level: number; remaining: number }[];
  ownerIncapacitated: boolean;
  arcaneJoltUsed: number;
  notice?: string;
}
