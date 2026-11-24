// Shape of the JSON `data` blob stored on a campaign row. Optional and open-ended for the same
// reasons as CharacterData: rows predate fields, and unknown keys must round-trip untouched.
export interface CampaignData {
  allowed_sources?: string[];
  [key: string]: unknown;
}
