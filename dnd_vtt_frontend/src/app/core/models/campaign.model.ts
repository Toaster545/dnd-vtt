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
