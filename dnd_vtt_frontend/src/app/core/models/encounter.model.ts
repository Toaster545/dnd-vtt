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
