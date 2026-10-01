import { AvatarRecipeV1 } from './avatar.model';
import { TokenBorder } from './token-border.model';

export interface Encounter {
  id?: string;
  dm_id?: string;
  session_id?: string | null;
  name: string;
  // Entry level — where a player whose character has no token yet lands. Always levels[0].
  map_id?: string | null;
  // Every level (dungeon floor) of the encounter, entry level first. DM-only: players are never
  // sent the list, they only learn the level they're on (see MyEncounterLevel).
  levels?: EncounterLevel[];
  // Write-only on create/update: the ordered level map ids, replacing `levels` wholesale.
  map_ids?: string[];
  monsters: string[];
  character_ids: string[];
  status: 'draft' | 'active' | 'ended';
  summary?: string;
  visible_to_players?: boolean;
  // Whose turn it currently is on the encounter's map, and which round of combat that's in — null
  // current_turn_token_id means turns haven't started yet (or the encounter has no active combat).
  current_turn_token_id?: string | null;
  round_number?: number;
  // Which level the current-turn token is on (DM responses only).
  current_turn_map_id?: string | null;
  // character_id -> level the DM has switched that player to (DM responses only). A character
  // not listed sees the entry level (map_id).
  player_levels?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface EncounterLevel {
  map_id: string;
  name: string;
  position: number;
}

// The level a player's own character is on — wherever its token is, else the entry level.
export interface MyEncounterLevel {
  map_id: string | null;
  name: string | null;
  level_count: number;
}

export interface TurnState {
  current_turn_token_id: string | null;
  current_turn_map_id?: string | null;
  // character_id -> level the DM has switched that player to (DM responses only). A character
  // not listed sees the entry level (map_id).
  player_levels?: Record<string, string>;
  round_number: number;
}

// Broadcast the moment a DM starts an encounter — global (not room-scoped), so a listening client
// checks `campaignId` against campaigns it belongs to before surfacing anything.
export interface EncounterStartedEvent {
  encounterId: string;
  sessionId: string;
  campaignId: string;
  name: string;
}

// Broadcast to a campaign room the moment the DM levels the party up — a listening member's
// client resolves its own affected character and surfaces a "level-up ready" banner in the shell.
export interface PartyLeveledEvent {
  campaignId: string;
  campaignName: string;
  level: number;
}

// A player currently viewing this encounter — ephemeral (live socket presence), not stored.
export interface PresentPlayer {
  socketId: string;
  username: string;
  characterId: string;
  characterName: string;
  // Self-reported by that player's own client — read-only for anyone else watching presence.
  hp?: number;
  max_hp?: number;
  portraitSeed?: string;
  avatarRecipe?: AvatarRecipeV1;
  portraitImage?: string;
  tokenBorder?: TokenBorder;
}
