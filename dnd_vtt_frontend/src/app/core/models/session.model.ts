export interface Session {
  id: string;
  name: string;
  description: string;
  dm_id: string;
  campaign_id: string;
  visible_to_players: boolean | number;
  created_at: string;
}
