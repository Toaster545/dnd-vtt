import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';

// The "who may see this campaign's maps/encounters" rules, in one place. REST services
// (MapsService, EncountersService) and the socket gateways all go through here, so a player's
// visibility can't drift between the HTTP and websocket paths.
//
// Throws Nest HttpExceptions; gateways convert them with `wsGuard` (common/ws-guard.ts).
@Injectable()
export class CampaignAccessService {
  constructor(private db: DatabaseService) {}

  async isActiveMember(campaignId: string, userId: string): Promise<boolean> {
    const membership = await this.db.execute(
      `SELECT id FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    return !!membership.rows[0];
  }

  async assertActiveMember(campaignId: string, userId: string) {
    if (!(await this.isActiveMember(campaignId, userId)))
      throw new ForbiddenException();
  }

  // True when a map is a level of an encounter that both its session and the encounter itself
  // have revealed to players — the only way a non-DM may see a map.
  async isMapRevealedToPlayers(
    mapId: string,
    campaignId: string,
  ): Promise<boolean> {
    const visible = await this.db.execute(
      `SELECT e.id FROM encounters e
       JOIN encounter_levels el ON el.encounter_id = e.id
       JOIN sessions s ON s.id = e.session_id
       WHERE el.map_id = ? AND s.campaign_id = ?
         AND s.visible_to_players = 1 AND e.visible_to_players = 1
       LIMIT 1`,
      [mapId, campaignId],
    );
    return !!visible.rows[0];
  }

  // The caller's relationship to a campaign's map: the campaign's DM, or an active member while
  // the map is revealed. Anything else is forbidden.
  async mapRole(
    campaignId: string,
    mapId: string,
    userId: string,
    isDm: boolean,
  ): Promise<'dm' | 'player'> {
    if (isDm) return 'dm';
    await this.assertActiveMember(campaignId, userId);
    if (!(await this.isMapRevealedToPlayers(mapId, campaignId)))
      throw new ForbiddenException();
    return 'player';
  }

  // Socket entry point for map rooms: resolves the map's campaign and the DM check itself.
  async socketMapRole(mapId: string, userId: string): Promise<'dm' | 'player'> {
    const map = (
      await this.db.execute(
        `SELECT campaign_id FROM battle_maps WHERE id = ?`,
        [mapId],
      )
    ).rows[0];
    if (!map) throw new NotFoundException('Map not found');
    const campaignId = map.campaign_id as string;
    const campaign = await this.db.execute(
      `SELECT dm_id FROM campaigns WHERE id = ?`,
      [campaignId],
    );
    return this.mapRole(
      campaignId,
      mapId,
      userId,
      campaign.rows[0]?.dm_id === userId,
    );
  }

  // Loads an encounter for a socket client. The DM always gets it; a player needs to be an
  // active member and the session + encounter must be visible (and, for `requireActive`, the
  // encounter running).
  async encounterFor(
    encounterId: string,
    userId: string,
    requireActive = false,
  ) {
    const result = await this.db.execute(
      `SELECT e.*, s.campaign_id, s.visible_to_players AS session_visible,
              c.dm_id AS campaign_dm_id
       FROM encounters e
       JOIN sessions s ON s.id = e.session_id
       JOIN campaigns c ON c.id = s.campaign_id
       WHERE e.id = ?`,
      [encounterId],
    );
    const encounter = result.rows[0];
    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.campaign_dm_id === userId) return encounter;
    await this.assertActiveMember(encounter.campaign_id as string, userId);
    if (
      !encounter.session_visible ||
      !encounter.visible_to_players ||
      (requireActive && encounter.status !== 'active')
    ) {
      throw new ForbiddenException();
    }
    return encounter;
  }
}
