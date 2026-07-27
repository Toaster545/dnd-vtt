export interface Campaign {
  id?: string;
  admin_id: string;
  name: string;
  description?: string;
  created_at?: string;
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

// What's "armed" from an encounter's roster sidebar, ready to be dropped onto the map on the next
// click — built by the roster UI (from a Character or a DndMonster), consumed by BattleMapComponent
// to fill in a new token's fields instead of a manually-typed label/color.
export interface PlacingEntity {
  kind: 'monster' | 'character';
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
