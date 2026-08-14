import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { generateJoinCode } from '../common/join-code.util';
import { saveUploadedImage } from '../common/upload.util';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { JoinCampaignDto } from './dto/join-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import type { RequestUser } from '../common/current-user.decorator';
import {
  DEFAULT_PLAYER_SOURCES,
  EBERRON_SOURCE_CODE,
  disallowedSources,
  normalizePlayerSources,
  sourceName,
} from '../content/content-sources';

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          !!entry && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];
}

@Injectable()
export class CampaignsService {
  constructor(private db: DatabaseService) {}

  async create(dmId: string, dto: CreateCampaignDto) {
    const id = randomUUID();
    let joinCode: string;
    do {
      joinCode = generateJoinCode();
    } while (
      (
        await this.db.execute(`SELECT id FROM campaigns WHERE join_code = ?`, [
          joinCode,
        ])
      ).rows.length > 0
    );

    const data = JSON.stringify({
      allowed_sources: normalizePlayerSources(dto.allowed_sources),
    });
    await this.db.execute(
      `INSERT INTO campaigns (id, dm_id, name, description, join_code, data) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, dmId, dto.name, dto.description ?? '', joinCode, data],
    );
    return this.findOne(id, { id: dmId, role: 'admin' } as RequestUser);
  }

  // Ownership-aware, not role-aware: a user can simultaneously own campaigns (created, dm_id
  // theirs) and belong to others (joined via a code) — this returns the union, each row tagged
  // `is_owner` so the frontend can route to the right hub view. If a campaign somehow appears in
  // both sets (a DM who also joined their own campaign), the owned copy wins.
  async findAllForUser(user: RequestUser) {
    const [owned, joined, visits] = await Promise.all([
      this.db.execute('SELECT * FROM campaigns WHERE dm_id = ?', [user.id]),
      this.db.execute(
        `SELECT c.* FROM campaigns c
         JOIN campaign_members m ON m.campaign_id = c.id
         WHERE m.user_id = ? AND m.status = 'active'`,
        [user.id],
      ),
      this.db.execute(
        `SELECT campaign_id, visited_at FROM campaign_visits WHERE user_id = ?`,
        [user.id],
      ),
    ]);
    const visitedAt = new Map<string, string>(
      visits.rows.map((row) => [
        row.campaign_id as string,
        row.visited_at as string,
      ]),
    );
    const byId = new Map<
      string,
      ReturnType<typeof this.deserialize> & { is_owner: boolean }
    >();
    for (const row of joined.rows)
      byId.set(row.id as string, { ...this.deserialize(row), is_owner: false });
    for (const row of owned.rows)
      byId.set(row.id as string, { ...this.deserialize(row), is_owner: true });
    // Most recently visited first; campaigns never opened yet (no row in campaign_visits) fall
    // back to creation date and sort after anything with an actual visit.
    return [...byId.values()].sort((a, b) => {
      const aVisited = visitedAt.get(a.id as string);
      const bVisited = visitedAt.get(b.id as string);
      if (aVisited && bVisited) return bVisited.localeCompare(aVisited);
      if (aVisited) return -1;
      if (bVisited) return 1;
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }

  async findOne(id: string, user: RequestUser) {
    const campaign = await this.getCampaignRow(id);
    const isOwner = campaign.dm_id === user.id;
    if (!isOwner) await this.assertActiveMember(id, user.id);
    await this.recordVisit(id, user.id);

    const sessions = await this.db.execute(
      isOwner
        ? 'SELECT * FROM sessions WHERE campaign_id = ? ORDER BY created_at DESC'
        : `SELECT * FROM sessions WHERE campaign_id = ? AND visible_to_players = 1 ORDER BY created_at DESC`,
      [id],
    );

    const members = await this.db.execute(
      `SELECT m.user_id, p.username, m.character_id, m.edit_unlocked, m.show_race_class,
              m.visible_to_party,
              ch.name AS character_name, ch.race AS character_race, ch.class AS character_class,
              ch.level AS character_level, ch.data AS character_data
       FROM campaign_members m
       JOIN profiles p ON p.id = m.user_id
       JOIN characters ch ON ch.id = m.character_id
       WHERE m.campaign_id = ? AND m.status = 'active'
       ORDER BY m.joined_at ASC`,
      [id],
    );

    const deserializedCampaign = this.deserialize(campaign);
    const allowedSources = deserializedCampaign.allowed_sources;
    return {
      ...deserializedCampaign,
      sessions: sessions.rows,
      // The DM manages the full roster regardless of visibility; a player sees everyone the DM
      // has left visible, plus always their own row (so they can still reach their own character).
      members: members.rows
        .map((row) =>
          this.deserializeMember(row, { id: user.id, isOwner }, allowedSources),
        )
        .filter((m) => isOwner || m.visible_to_party || m.user_id === user.id),
    };
  }

  async update(id: string, dmId: string, dto: UpdateCampaignDto) {
    const campaign = await this.getCampaignRow(id);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();

    const fields: string[] = [];
    const args: unknown[] = [];
    if (dto.description !== undefined) {
      fields.push('description = ?');
      args.push(dto.description);
    }
    if (dto.background_url !== undefined) {
      fields.push('background_url = ?');
      args.push(dto.background_url);
    }
    if (dto.allowed_sources !== undefined) {
      const allowedSources = normalizePlayerSources(dto.allowed_sources);
      const data = this.db.parseJson<Record<string, unknown>>(
        campaign.data as string,
        {},
      );
      fields.push('data = ?');
      args.push(
        JSON.stringify({
          ...data,
          allowed_sources: allowedSources,
        }),
      );
    }
    if (fields.length > 0) {
      args.push(id);
      await this.db.execute(
        `UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`,
        args,
      );
    }
    return this.findOne(id, { id: dmId, role: 'admin' } as RequestUser);
  }

  async uploadBackground(id: string, dmId: string, file: Express.Multer.File) {
    const campaign = await this.getCampaignRow(id);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();
    const url = saveUploadedImage(file, `campaigns/${id}`);
    await this.db.execute(
      'UPDATE campaigns SET background_url = ? WHERE id = ?',
      [url, id],
    );
    return this.findOne(id, { id: dmId, role: 'admin' } as RequestUser);
  }

  async remove(id: string, dmId: string) {
    const campaign = await this.getCampaignRow(id);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();
    await this.db.execute('DELETE FROM campaigns WHERE id = ?', [id]);
    return { deleted: true };
  }

  // Idempotent: rejoining with an already-active membership just returns it, rather than erroring,
  // so a page refresh or duplicate click doesn't create a second copy.
  async join(user: RequestUser, dto: JoinCampaignDto) {
    const campaignResult = await this.db.execute(
      'SELECT * FROM campaigns WHERE join_code = ?',
      [dto.joinCode.trim().toUpperCase()],
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) throw new NotFoundException('No campaign with that code');

    const existing = await this.db.execute(
      `SELECT * FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaign.id, user.id],
    );
    if (existing.rows.length > 0)
      return this.findOne(campaign.id as string, user);

    const sourceResult = await this.db.execute(
      'SELECT * FROM characters WHERE id = ?',
      [dto.characterId],
    );
    const source = sourceResult.rows[0];
    if (!source) throw new NotFoundException('Character not found');
    if (source.user_id !== user.id)
      throw new ForbiddenException('You do not own that character');
    if (source.campaign_id)
      throw new ForbiddenException('That character is already a campaign copy');

    const compatibility = this.characterSourceCompatibility(source, campaign);
    if (!compatibility.compatible) {
      throw new BadRequestException(compatibility.reason);
    }

    // There's no standalone "campaign level" column — the campaign's level is whatever the
    // existing party's character copies are already at (kept in sync by setPartyLevel). A
    // freshly joining character should start there too rather than at its own source level, so
    // it doesn't show up under- or over-leveled relative to the rest of the party.
    const partyLevelResult = await this.db.execute(
      `SELECT MAX(ch.level) AS level FROM campaign_members m
       JOIN characters ch ON ch.id = m.character_id
       WHERE m.campaign_id = ? AND m.status = 'active'`,
      [campaign.id],
    );
    const campaignLevel =
      (partyLevelResult.rows[0]?.level as number | null) ?? source.level;

    const copyId = randomUUID();
    const now = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO characters (id, user_id, name, race, class, level, data, campaign_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        copyId,
        user.id,
        source.name,
        source.race,
        source.class,
        campaignLevel,
        source.data,
        campaign.id,
        now,
        now,
      ],
    );

    const membershipId = randomUUID();
    await this.db.execute(
      // New members start hidden from the rest of the party's list — the DM opts each one in via
      // setMemberPartyVisibility rather than everyone being visible by default (see V15).
      `INSERT INTO campaign_members (id, campaign_id, user_id, character_id, source_character_id, visible_to_party)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [membershipId, campaign.id, user.id, copyId, dto.characterId],
    );

    return this.findOne(campaign.id as string, user);
  }

  async previewJoin(userId: string, joinCode: string) {
    const campaignResult = await this.db.execute(
      'SELECT * FROM campaigns WHERE join_code = ?',
      [joinCode.trim().toUpperCase()],
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) throw new NotFoundException('No campaign with that code');

    const characters = await this.db.execute(
      `SELECT * FROM characters
       WHERE user_id = ? AND campaign_id IS NULL
       ORDER BY created_at DESC`,
      [userId],
    );
    const campaignData = this.deserialize(campaign);
    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      allowed_sources: campaignData.allowed_sources,
      characters: characters.rows.map((character) => ({
        character_id: character.id,
        ...this.characterSourceCompatibility(character, campaign),
      })),
    };
  }

  // Full membership list including removed rows — DM-only, for the member-management view.
  async getMembers(campaignId: string, dmId: string) {
    const campaign = await this.getCampaignRow(campaignId);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();
    const result = await this.db.execute(
      `SELECT m.*, p.username, ch.name AS character_name
       FROM campaign_members m
       JOIN profiles p ON p.id = m.user_id
       JOIN characters ch ON ch.id = m.character_id
       WHERE m.campaign_id = ?
       ORDER BY m.joined_at ASC`,
      [campaignId],
    );
    return result.rows;
  }

  async removeMember(campaignId: string, dmId: string, userId: string) {
    const campaign = await this.getCampaignRow(campaignId);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();
    const membership = await this.db.execute(
      `SELECT character_id FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    const characterId = membership.rows[0]?.character_id as string | undefined;
    await this.db.execute(
      `UPDATE campaign_members SET status = 'removed' WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    // Detach the campaign copy so it goes back to being a normal, fully player-editable character
    // instead of sitting orphaned with a campaign_id the player can no longer access (see
    // CharactersService.update, which DM-locks a character purely based on campaign_id being set).
    if (characterId) {
      await this.db.execute(
        `UPDATE characters SET campaign_id = NULL, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), characterId],
      );
    }
    return { removed: true };
  }

  // Grants (or revokes) a player full edit access to their own campaign copy — normally only the
  // DM can write it (see CharactersService.update). Unlocking lets the player open the character
  // wizard on it themselves instead of the DM having to make every change on their behalf.
  async setMemberEditAccess(
    campaignId: string,
    dmId: string,
    userId: string,
    unlocked: boolean,
  ) {
    const campaign = await this.getCampaignRow(campaignId);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();
    const result = await this.db.execute(
      `UPDATE campaign_members SET edit_unlocked = ? WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [unlocked ? 1 : 0, campaignId, userId],
    );
    if (result.rowsAffected === 0)
      throw new NotFoundException('Member not found');
    return { edit_unlocked: unlocked };
  }

  // DM-controlled: hides a member from the party list shown to the rest of the party (e.g. an
  // absent player, or a companion character not yet meant to be public) — findOne's post-query
  // filter still always shows the DM everyone, and shows each player their own row regardless.
  async setMemberPartyVisibility(
    campaignId: string,
    dmId: string,
    userId: string,
    visible: boolean,
  ) {
    const campaign = await this.getCampaignRow(campaignId);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();
    const result = await this.db.execute(
      `UPDATE campaign_members SET visible_to_party = ? WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [visible ? 1 : 0, campaignId, userId],
    );
    if (result.rowsAffected === 0)
      throw new NotFoundException('Member not found');
    return { visible_to_party: visible };
  }

  // Player-controlled, not DM-gated like setMemberEditAccess — a player decides for themselves
  // whether the rest of the party sees their race/class in the roster (hidden by default, see V14).
  async setOwnRaceClassVisibility(
    campaignId: string,
    userId: string,
    visible: boolean,
  ) {
    const result = await this.db.execute(
      `UPDATE campaign_members SET show_race_class = ? WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [visible ? 1 : 0, campaignId, userId],
    );
    if (result.rowsAffected === 0)
      throw new NotFoundException('Membership not found');
    return this.findOne(campaignId, {
      id: userId,
      role: 'player',
    } as RequestUser);
  }

  // Sets every active member's campaign-copy character to the same level in one shot — used by
  // the DM hub's party level control (manual set and "level party up" both funnel through here).
  // Only touches the `level` column; HP/spell slots/features stay whatever they were — the backend
  // has no per-class hit-die/CON-mod math to recompute max_hp, so HP is left for the DM to adjust
  // per character through the wizard, same as leveling a single character up manually.
  async setPartyLevel(campaignId: string, dmId: string, level: number) {
    const campaign = await this.getCampaignRow(campaignId);
    if (campaign.dm_id !== dmId) throw new ForbiddenException();
    await this.db.execute(
      `UPDATE characters SET level = ?, updated_at = ?
       WHERE id IN (
         SELECT character_id FROM campaign_members
         WHERE campaign_id = ? AND status = 'active'
       )`,
      [level, new Date().toISOString(), campaignId],
    );
    return this.findOne(campaignId, { id: dmId, role: 'admin' } as RequestUser);
  }

  private async getCampaignRow(id: string) {
    const result = await this.db.execute(
      'SELECT * FROM campaigns WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Campaign not found');
    return row;
  }

  // Upserted every time a user successfully opens a campaign's hub — powers findAllForUser's
  // most-recently-visited ordering. Per-user, not per-membership, so it works the same for the
  // owning DM (who has no campaign_members row) and for joined players.
  private async recordVisit(campaignId: string, userId: string) {
    await this.db.execute(
      `INSERT INTO campaign_visits (campaign_id, user_id, visited_at) VALUES (?, ?, ?)
       ON CONFLICT(campaign_id, user_id) DO UPDATE SET visited_at = excluded.visited_at`,
      [campaignId, userId, new Date().toISOString()],
    );
  }

  private async assertActiveMember(campaignId: string, userId: string) {
    const membership = await this.db.execute(
      `SELECT id FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    if (membership.rows.length === 0) throw new ForbiddenException();
  }

  // The member row's own top-level columns (name/race/class/level) are fast to select directly;
  // HP/AC only exist inside the character's JSON `data` blob, so pull just those for the hub's
  // party-list summary rather than shipping the whole character document down for every member.
  private deserializeMember(
    row: Record<string, unknown>,
    viewer: { id: string; isOwner: boolean },
    allowedSources: string[],
  ) {
    const data = this.db.parseJson<Record<string, unknown>>(
      row.character_data as string,
      {},
    );
    const showRaceClass = !!row.show_race_class;
    // Hidden from the rest of the party by default (see V14) — a player only sees their own
    // race/class plus anyone who's opted in; the DM always sees everyone's regardless.
    const revealRaceClass =
      viewer.isOwner || row.user_id === viewer.id || showRaceClass;
    const compatibility = this.sourceCompatibility(
      this.enabledSources(data, row.character_class),
      allowedSources,
    );
    return {
      user_id: row.user_id,
      username: row.username,
      character_id: row.character_id,
      edit_unlocked: !!row.edit_unlocked,
      character_name: row.character_name,
      character_race: revealRaceClass ? row.character_race : null,
      character_class: revealRaceClass ? row.character_class : null,
      character_level: row.character_level,
      character_max_hp: data.max_hp ?? null,
      character_current_hp: data.current_hp ?? null,
      character_armor_class: data.armor_class ?? null,
      character_portrait_seed: data.portrait_seed ?? null,
      show_race_class: showRaceClass,
      visible_to_party: !!row.visible_to_party,
      source_compatible: compatibility.compatible,
      source_incompatibility_reason: compatibility.reason,
    };
  }

  private deserialize(row: Record<string, unknown>) {
    const data = this.db.parseJson<Record<string, unknown>>(
      row.data as string,
      {},
    );
    return {
      ...data,
      allowed_sources: normalizePlayerSources(data.allowed_sources),
      id: row.id,
      dm_id: row.dm_id,
      name: row.name,
      description: row.description,
      join_code: row.join_code,
      background_url: row.background_url ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private enabledSources(
    data: Record<string, unknown>,
    characterClass: unknown,
  ): string[] {
    const enabled = Array.isArray(data.enabled_sources)
      ? stringArray(data.enabled_sources)
      : [...DEFAULT_PLAYER_SOURCES];
    const classes = recordArray(data.classes);
    const spellEntries = [
      ...recordArray(data.spells),
      ...recordArray(data.granted_spells),
    ];
    if (
      String(characterClass).toLowerCase() === 'artificer' ||
      classes.some(
        (entry) => String(entry.name).toLowerCase() === 'artificer',
      ) ||
      spellEntries.some((entry) => entry.spellIndex === 'homunculus-servant')
    ) {
      enabled.push(EBERRON_SOURCE_CODE);
    }
    return normalizePlayerSources(enabled);
  }

  private characterSourceCompatibility(
    character: Record<string, unknown>,
    campaign: Record<string, unknown>,
  ) {
    const characterData = this.db.parseJson<Record<string, unknown>>(
      character.data as string,
      {},
    );
    const campaignData = this.db.parseJson<Record<string, unknown>>(
      campaign.data as string,
      {},
    );
    return this.sourceCompatibility(
      this.enabledSources(characterData, character.class),
      normalizePlayerSources(campaignData.allowed_sources),
    );
  }

  private sourceCompatibility(enabled: unknown, allowed: unknown) {
    const disallowed = disallowedSources(enabled, allowed);
    return {
      compatible: disallowed.length === 0,
      disallowed_sources: disallowed,
      reason:
        disallowed.length === 0
          ? null
          : `This campaign doesn't allow ${disallowed.map(sourceName).join(', ')}. Remove character options from that source or ask the DM to allow it.`,
    };
  }
}
