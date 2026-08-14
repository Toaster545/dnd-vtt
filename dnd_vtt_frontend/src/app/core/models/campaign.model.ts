export interface Campaign {
  id: string;
  dm_id: string;
  name: string;
  description?: string;
  join_code: string;
  background_url?: string | null;
  created_at?: string;
  updated_at?: string;
  allowed_sources: string[];
  // Only present on the CampaignService.getAll() list (CampaignsService.findAllForUser on the
  // backend) — true when the current user is this campaign's DM, false when they're just a
  // joined member. A single user can own some campaigns and be a member of others, so the list
  // is the union of both, distinguished by this flag.
  is_owner?: boolean;
}

export interface CampaignMember {
  id?: string;
  user_id: string;
  username: string;
  character_id: string;
  character_name: string;
  character_race?: string;
  character_class?: string;
  character_level?: number;
  character_max_hp?: number | null;
  character_current_hp?: number | null;
  character_armor_class?: number | null;
  character_portrait_seed?: string | null;
  source_character_id?: string | null;
  status?: 'active' | 'removed';
  joined_at?: string;
  // DM-grantable full edit access to this member's campaign character copy — see
  // CampaignService.setMemberEditAccess / CharactersService.update's edit_unlocked check.
  edit_unlocked?: boolean;
  // Player-controlled visibility of their own race/class to the rest of the party (hidden by
  // default) — see CampaignService.setOwnRaceClassVisibility. character_race/character_class
  // above already come back redacted from the backend when this is false and it isn't your own row.
  show_race_class?: boolean;
  // DM-controlled visibility of this member in the party list shown to the rest of the party
  // (defaults to true) — see CampaignService.setMemberPartyVisibility. A hidden member is simply
  // omitted from the `members` array returned to other players; the DM and the member themselves
  // always see it regardless of this flag.
  visible_to_party?: boolean;
  source_compatible?: boolean;
  source_incompatibility_reason?: string | null;
}

export interface CampaignJoinPreview {
  campaign_id: string;
  campaign_name: string;
  allowed_sources: string[];
  characters: {
    character_id: string;
    compatible: boolean;
    disallowed_sources: string[];
    reason: string | null;
  }[];
}

// GET /campaigns/:id payload — the campaign plus what's inside it, scoped to whatever the caller
// (owning DM, or active member) is allowed to see.
export interface CampaignHub extends Campaign {
  sessions: CampaignSession[];
  members: CampaignMember[];
}

// Session shape as returned nested inside a CampaignHub — see session.model.ts for the standalone
// Session interface used by SessionService.
export interface CampaignSession {
  id: string;
  name: string;
  description: string;
  dm_id: string;
  campaign_id: string;
  visible_to_players: boolean | number;
  created_at: string;
}

export interface BattleMap {
  id?: string;
  campaign_id: string;
  name: string;
  image_url: string;
  uvtt_data?: UniversalVTTData;
  grid_size: number;
  created_at?: string;
}

export interface MapToken {
  id?: string;
  map_id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  size: number;
  hp?: number;
  max_hp?: number;
  is_player: boolean;
  // Which roster entry this token represents, if any — a character token's HP lives on the
  // Character record itself (see character_id), while a monster token's hp/max_hp above are the
  // actual per-instance combat HP (independent per placed copy of the same monster type).
  character_id?: string;
  monster_index?: string;
  // Turn-order value: 1d20 + DEX mod, auto-rolled server-side the moment a monster token is
  // placed; null for a player token until the DM types in that player's roll.
  initiative?: number | null;
}

// Manual reveal-brush fog of war. `hidden_cells` is a set of "col,row" keys — everything else on
// the grid is visible. A freshly-enabled map starts with an empty set (fully visible); the DM
// paints/rect-selects areas to hide. Persisted per map and broadcast live, same as tokens.
export interface MapFog {
  enabled: boolean;
  hidden_cells: string[];
}

// A Roll20-style ruler/cone/sphere measurement, drawn while dragging on the map. Only the DM's
// measurements are broadcast live to everyone else viewing it (see BattleMapService.watchMeasurements /
// BattleMapComponent's auth.isAdmin() gate on sendMeasure) — a player's own measurement is rendered
// locally only, never sent to other viewers. Never persisted. Grid-cell coordinates (fractional,
// snapped to intersections), not pixels, so it renders correctly for every viewer regardless of
// their own canvas scale.
export type MeasureShape = 'line' | 'cone' | 'sphere';
export interface Measurement {
  shape: MeasureShape;
  originCol: number;
  originRow: number;
  pointCol: number;
  pointRow: number;
}

// Which fog-of-war brush/rectangle tool is currently armed on the battle map toolbar.
export type FogToolName = 'reveal-brush' | 'hide-brush' | 'reveal-rect' | 'hide-rect';

// What's "armed" from an encounter's roster sidebar, ready to be dropped onto the map on the next
// click — built by the roster UI (from a Character or a DndMonster), consumed by BattleMapComponent
// to fill in a new token's fields instead of a manually-typed label/color.
export interface PlacingEntity {
  kind: 'monster' | 'character' | 'custom';
  label: string;
  color: string;
  size: number;
  hp?: number;
  max_hp?: number;
  characterId?: string;
  monsterIndex?: string;
}

export interface UniversalVTTData {
  format: number;
  resolution: { map_origin: { x: number; y: number }; map_size: { x: number; y: number }; pixels_per_grid: number };
  portals: Portal[];
  environment: { baked_lighting: boolean; ambient_light: string };
  lights: Light[];
  image: string;
  line_of_sight: number[][];
  objects_line_of_sight: number[][];
}

interface Portal {
  position: { x: number; y: number };
  bounds: { x: number; y: number }[];
  rotation: number;
  closed: boolean;
  freestanding: boolean;
}

interface Light {
  position: { x: number; y: number };
  range: number;
  intensity: number;
  color: string;
  shadows: boolean;
}
