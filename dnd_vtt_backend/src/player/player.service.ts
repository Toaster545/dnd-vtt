import { Injectable } from '@nestjs/common';
import { CampaignsService } from '../campaigns/campaigns.service';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';

@Injectable()
export class PlayerService {
  constructor(
    private db: DatabaseService,
    private campaignsService: CampaignsService,
  ) {}

  async bootstrap(
    user: RequestUser,
    requested: { campaignId?: string; characterId?: string },
  ) {
    const [profileResult, characterResult, campaigns] = await Promise.all([
      this.db.execute(
        `SELECT id, email, username, role, created_at FROM profiles WHERE id = ?`,
        [user.id],
      ),
      this.db.execute(
        `SELECT * FROM characters WHERE user_id = ? ORDER BY updated_at DESC`,
        [user.id],
      ),
      this.campaignsService.findAllForUser(user),
    ]);

    const characters = characterResult.rows.map((row) => {
      const data = this.db.parseJson<Record<string, unknown>>(
        row.data as string,
        {},
      );
      return {
        id: row.id,
        campaign_id: row.campaign_id ?? null,
        name: row.name,
        race: row.race,
        class: row.class,
        level: Number(row.level ?? 1),
        current_hp: data.current_hp ?? null,
        max_hp: data.max_hp ?? null,
        temp_hp: data.temp_hp ?? null,
        armor_class: data.armor_class ?? null,
        conditions: Array.isArray(data.conditions) ? data.conditions : [],
        portrait_seed: data.portrait_seed ?? null,
        creation_status: row.creation_status ?? 'complete',
        draft_step: Number(row.draft_step ?? 0),
        updated_at: row.updated_at,
      };
    });
    const campaignSummaries = campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      background_url: campaign.background_url,
      is_owner: campaign.is_owner,
      current_session_id: campaign.current_session_id ?? null,
      updated_at: campaign.updated_at,
    }));

    const requestedCampaign = requested.campaignId
      ? campaignSummaries.find(
          (campaign) => campaign.id === requested.campaignId,
        )
      : undefined;
    const requestedCharacter = requested.characterId
      ? characters.find((character) => character.id === requested.characterId)
      : undefined;
    const selectedCampaign = requestedCampaign ?? campaignSummaries[0] ?? null;
    const campaignCharacter = selectedCampaign
      ? characters.find(
          (character) => character.campaign_id === selectedCampaign.id,
        )
      : undefined;
    const selectedCharacter =
      requestedCharacter ?? campaignCharacter ?? characters[0] ?? null;
    const currentContext = selectedCampaign
      ? await this.campaignsService.getCurrentContext(
          selectedCampaign.id as string,
          user,
        )
      : null;

    return {
      profile: profileResult.rows[0] ?? null,
      characters,
      campaigns: campaignSummaries,
      selected_character_id: selectedCharacter?.id ?? null,
      selected_campaign_id: selectedCampaign?.id ?? null,
      current_context: currentContext,
      server_time: new Date().toISOString(),
    };
  }
}
