/**
 * Domain types for the character JSON data blob (stored as `data` JSON column in `characters`).
 *
 * All fields are optional because:
 * - Rows predate many fields (older data may be missing them).
 * - Drafts are half-filled during the creation wizard.
 * - DMs can patch the schemaless blob with arbitrary keys.
 *
 * The trailing `[key: string]: unknown` index signature ensures unknown / DM-patched keys
 * still round-trip unchanged — existing code keeps compiling while known fields gain real types.
 *
 * Mirrors the frontend model at
 * `dnd_vtt_frontend/src/app/core/models/character.model.ts` so the two stay recognisably
 * the same shape.
 *
 * See MAINTAINABILITY_ISSUES.md #1 and PLAN_TYPE_DOMAIN_OBJECTS.md.
 */

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export interface AbilityScoresData {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
}

export interface EquipmentEntryData {
  instanceId?: string;
  baseItemIndex?: string;
  needsBase?: boolean;
  unresolved?: boolean;
  chargesUsed?: number;
  origin?: {
    creatorId: string;
    planId: string;
    planName: string;
    createdAt: string;
  };
  itemIndex: string;
  name: string;
  quantity?: number;
  equipped?: boolean;
  attuned?: boolean;
}

export interface ClassEntryData {
  name: string;
  level?: number;
  subclass?: string;
  choices?: Record<string, unknown>;
  spells?: Record<string, unknown>;
  spellKnown?: Record<string, unknown>;
  spellPrepared?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SpellEntryData {
  spellIndex: string;
  name: string;
  prepared?: boolean;
  sourceKey?: string;
  sourceName?: string;
  category?: 'known' | 'spellbook' | 'prepared' | 'always_prepared';
  alwaysPrepared?: boolean;
}

export interface GrantedSpellEntryData {
  spellIndex: string;
  name: string;
  sourceKey?: string;
  sourceName: string;
  level?: number;
  [key: string]: unknown;
}

export interface PactWeaponData {
  instanceId?: string;
  itemIndex: string;
  name: string;
  mode: 'conjured' | 'bonded';
  createdAt: string;
}

export interface CurrencyData {
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
}

export interface DeathSavesData {
  successes?: number;
  failures?: number;
}

export interface ActiveConcentrationData {
  spellIndex: string;
  name: string;
  sourceKey: string;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export interface CharacterData {
  // Columns deserialize() layers onto the blob; stripped again before it is rewritten
  // (see CHARACTER_COLUMN_KEYS in characters.service.ts).
  id?: string;
  user_id?: string;
  campaign_id?: string | null;
  creation_status?: 'draft' | 'complete';
  draft_step?: number;

  // Core identity
  name?: string;
  race?: string;
  class?: string;
  subclass?: string;
  level?: number;
  background?: string;

  // Sources
  enabled_sources?: string[];

  // Ability scores
  ability_scores?: AbilityScoresData;

  // HP & death saves
  max_hp?: number;
  max_hp_overridden?: boolean;
  current_hp?: number;
  temp_hp?: number;
  hit_dice_used?: number;
  hit_dice_total?: number;
  death_saves?: DeathSavesData;

  // Combat
  conditions?: string[];
  heroic_inspiration?: boolean;
  armor_class?: number;
  speed?: number;

  // Vision
  darkvision_ft?: number | null;

  // Proficiencies
  skills?: Record<string, boolean>;
  expertise?: Record<string, boolean>;

  // Inventory
  equipment?: EquipmentEntryData[];
  pact_weapon?: PactWeaponData | null;
  inventory_version?: number;
  attuned_items?: EquipmentEntryData[];
  replicated_items?: (EquipmentEntryData & {
    planName?: string;
    holderId?: string;
    holderName?: string;
    createdAt?: string;
  })[];
  currency?: CurrencyData;

  // Spells
  spells?: SpellEntryData[];
  granted_spells?: GrantedSpellEntryData[];
  spell_choices?: Record<string, string[]>;
  spell_slots_used?: Record<string, number>;
  spell_slot_uses?: Record<string, Record<string, number>>;
  spell_free_cast_uses?: Record<
    string,
    {
      used: number;
      max: number;
      recovery: 'short_rest' | 'long_rest';
      spellIndex: string;
    }
  >;
  active_concentration?: ActiveConcentrationData | null;

  // Resource uses (Second Wind, Action Surge, etc.)
  resource_uses?: Record<string, number>;

  // Class grants
  classes?: ClassEntryData[];

  // Flavor
  personality_traits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  notes?: string;

  // Avatar / portrait
  avatar_url?: string;
  portrait_seed?: string;
  avatar_recipe?: unknown;
  portrait_image?: string | null;
  token_border?: unknown;
  portrait_use_token?: boolean;

  // Timestamps
  created_at?: string;
  updated_at?: string;

  // Catch-all for unknown / DM-patched keys — ensures round-trip safety
  [key: string]: unknown;
}
