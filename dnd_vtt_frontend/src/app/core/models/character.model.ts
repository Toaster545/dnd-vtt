import { AvatarRecipeV1 } from './avatar.model';

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export type CharacterCreationStatus = 'draft' | 'complete';

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

export type ScoreMethod = 'standard' | 'pointbuy' | 'manual';

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

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
  sourceKey?: string;
  sourceName?: string;
  category?: 'known' | 'spellbook' | 'prepared' | 'always_prepared';
  alwaysPrepared?: boolean;
}

// A spell the DM handed a character directly (a scroll's contents, a boon, a magic item) rather
// than one earned through class/race/feat progression — see CharacterService.grantSpell. Kept
// separate from `spells` (a wizard-computed snapshot the play sheet doesn't read back) so it
// survives independently; resolveSpellcasting turns each into an always-available, at-will spell.
export interface GrantedSpellEntry {
  spellIndex: string;
  name: string;
  sourceName: string;
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
  creation_status?: CharacterCreationStatus;
  draft_step?: number;
  // Set once a template is cloned into a campaign (see CampaignsService.join on the backend) —
  // null/undefined for a portable template character not yet tied to any campaign.
  campaign_id?: string | null;
  // Source books enabled for this character. PHB 2024 (XPHB) is always present; expansion
  // codes such as EFA opt the wizard into their character options.
  enabled_sources?: string[];

  // Identity (reference content by name)
  name: string;
  race: string;
  subrace?: string;
  race_choices?: Record<string, string[]>; // race/subrace trait picks, e.g. Draconic Ancestry
  class: string;         // primary class name
  subclass?: string;     // primary class subclass
  level: number;         // total character level
  classes?: { name: string; level: number; subclass?: string; choices?: Record<string, string[]>; skills?: string[] }[]; // multiclass
  background: string;
  background_choices?: Record<string, string[]>; // background trait picks, incl. ability score increase
  languages?: string[]; // Common plus the character's selected/feature-granted languages
  alignment: string;

  // Starting-equipment picks (chosen groups/category items, or gold instead), keyed by
  // `mode` / `group:<key>` / `cat:<key>` — see core/utils/starting-equipment.ts. Only the
  // primary class's equipment is tracked, since starting gear is a level-1 concern.
  class_equipment_choices?: Record<string, string[]>;
  background_equipment_choices?: Record<string, string[]>;

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

  // Darkvision range in feet. null/undefined means "use the race's default" (see DndRace.darkvision_ft,
  // looked up live — not flattened at creation like speed/AC, so it stays correct if the DM patches
  // this later without having to re-run the wizard). An explicit value here — including 0 — overrides
  // the race default; used for e.g. magic items/feats/house rules the DM grants outside of race, set
  // via the DM's character-token-detail popover on the battle map, not the wizard.
  darkvision_ft?: number | null;

  // Proficiencies — class defaults computed at runtime, player choices stored here
  skills: Record<string, boolean>;
  expertise: Record<string, boolean>;

  // Inventory
  equipment: EquipmentEntry[];
  replicated_items?: {
    itemIndex: string;
    planName: string;
    equipped: boolean;
    createdAt: string;
  }[];
  currency: Currency;

  // Spells
  spells: SpellEntry[];
  granted_spells?: GrantedSpellEntry[]; // DM-granted, independent of class/race/feat progression
  spell_choices?: Record<string, string[]>; // stable resolver requirement key → selected spell indexes
  spell_slots_used: Record<string, number>; // slot level → count used
  spell_slot_uses?: Record<string, Record<string, number>>; // slot-pool key → slot level → count used
  spell_free_cast_uses?: Record<string, {
    used: number;
    max: number;
    recovery: 'short_rest' | 'long_rest';
    spellIndex: string;
  }>;
  active_concentration?: {
    spellIndex: string;
    name: string;
    sourceKey: string;
    startedAt: string;
  } | null;

  // Limited-use class/race/item features (Second Wind, Action Surge, etc.) — keyed by the
  // content grant's stable `key`, not its display name. Rest recovery clears entries by
  // ClassGrantAction.uses.per; slot-based spellcasting stays in spell_slots_used above.
  resource_uses: Record<string, number>;

  // Flavor
  personality_traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  notes: string;

  avatar_url?: string;
  portrait_seed?: string; // DiceBear (Lorelei style) seed for the generated portrait shown next to the character's name
  avatar_recipe?: AvatarRecipeV1; // Versioned, explicit avatar choices; portrait_seed remains the legacy/failure fallback
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
    enabled_sources: ['XPHB'],
    race: '', class: '', level: 1, background: '', languages: ['Common'], alignment: 'True Neutral',
    ability_scores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    max_hp: 10, current_hp: 10, temp_hp: 0, hit_dice_used: 0,
    death_saves: { successes: 0, failures: 0 },
    conditions: [],
    armor_class: 10, speed: 30,
    skills: {}, expertise: {},
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: [], spell_slots_used: {},
    resource_uses: {},
    personality_traits: '', ideals: '', bonds: '', flaws: '', notes: '',
  };
}
