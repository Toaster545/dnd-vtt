// A battle-map token as the server handles it: a `map_tokens` row (is_player normalised to a
// boolean) plus the fields CompanionsService.decorateTokens layers on for companion tokens.
// Columns are nullable/optional because they were added across many migrations. The index
// signature keeps columns not listed here flowing through untouched.
export interface TokenRow {
  id: string;
  map_id: string;
  label: string;
  color?: string;
  x: number;
  y: number;
  size: number;
  hp?: number | null;
  max_hp?: number | null;
  is_player?: boolean | number;
  character_id?: string | null;
  companion_id?: string | null;
  monster_index?: string | null;
  image_url?: string | null;
  initiative?: number | null;
  visible_to_players?: number | boolean;
  name_visible_to_players?: number | boolean;
  planned_x?: number | null;
  planned_y?: number | null;
  turn_start_x?: number | null;
  turn_start_y?: number | null;
  turn_anchor_x?: number | null;
  turn_anchor_y?: number | null;
  turn_moved_ft?: number;
  turn_diagonals?: number;
  companion_owner_id?: string;
  companion_owner_token_id?: string | null;
  companion_speed?: number;
  [key: string]: unknown;
}

// The single place a raw libsql `map_tokens` row becomes a TokenRow (libsql rows are loosely
// typed, so this is the one deliberate cast).
export function toTokenRow(row: Record<string, unknown>): TokenRow {
  return { ...row, is_player: !!row.is_player } as unknown as TokenRow;
}
