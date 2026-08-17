import { UserProfile } from './user.model';

export interface PlayerCharacterSummary { id: string; name: string; race: string; class: string; level: number; creation_status: 'draft' | 'complete'; draft_step: number; }
export interface PlayerCampaignSummary { id: string; name: string; is_owner: boolean; }
export interface PlayerCurrentContext {
  campaign_id: string;
  current_session: { id: string; name: string; campaign_id: string } | null;
  current_encounter: { id: string; name: string; session_id: string; map_id?: string | null } | null;
  current_map: { id: string; name: string } | null;
  updated_at: string;
}
export interface PlayerBootstrap {
  profile: UserProfile;
  characters: PlayerCharacterSummary[];
  campaigns: PlayerCampaignSummary[];
  selected_character_id: string | null;
  selected_campaign_id: string | null;
  current_context: PlayerCurrentContext | null;
  server_time: string;
}
export interface PlayerEncounterState { id: string; name: string; status: string; current_turn_token_id: string | null; round_number: number; map_id: string | null; }
export interface PlayerMapToken { id: string; map_id: string; label: string; color: string; x: number; y: number; size: number; is_player: boolean; character_id?: string; initiative?: number | null; }
export interface PlayerMapState { map: { id: string; name: string; image_url: string; grid_size: number }; tokens: PlayerMapToken[]; fog: { enabled: boolean; hidden_cells: string[] }; lighting: { enabled: boolean; lights: unknown[] }; }
