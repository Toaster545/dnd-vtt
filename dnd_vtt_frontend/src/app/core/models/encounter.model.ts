export interface Encounter {
  id?: string;
  dm_id?: string;
  session_id?: string | null;
  name: string;
  map_id?: string | null;
  monsters: string[];
  character_ids: string[];
  status: 'draft' | 'active' | 'ended';
  join_code?: string | null;
  summary?: string;
  visible_to_players?: boolean;
  // Whose turn it currently is on the encounter's map, and which round of combat that's in — null
  // current_turn_token_id means turns haven't started yet (or the encounter has no active combat).
  current_turn_token_id?: string | null;
  round_number?: number;
  created_at?: string;
  updated_at?: string;
}

// Broadcast the moment a DM starts an encounter — global (not room-scoped), so a listening client
// checks `campaignId` against campaigns it belongs to before surfacing anything.
export interface EncounterStartedEvent {
  encounterId: string;
  sessionId: string;
  campaignId: string;
  name: string;
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
}
