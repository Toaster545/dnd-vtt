import {
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

    await this.db.execute(
      `INSERT INTO campaigns (id, dm_id, name, description, join_code) VALUES (?, ?, ?, ?, ?)`,
      [id, dmId, dto.name, dto.description ?? '', joinCode],
    );
    return this.findOne(id, { id: dmId, role: 'admin' } as RequestUser);
  }

  // Role-aware: the DM sees campaigns they own; a player sees campaigns they've actively joined.
  async findAllForUser(user: RequestUser) {
    const result =
      user.role === 'admin'
        ? await this.db.execute(
            'SELECT * FROM campaigns WHERE dm_id = ? ORDER BY created_at DESC',
            [user.id],
          )
        : await this.db.execute(
            `SELECT c.* FROM campaigns c
             JOIN campaign_members m ON m.campaign_id = c.id
             WHERE m.user_id = ? AND m.status = 'active'
             ORDER BY c.created_at DESC`,
            [user.id],
          );
    return result.rows.map((r) => this.deserialize(r));
  }

  async findOne(id: string, user: RequestUser) {
    const campaign = await this.getCampaignRow(id);
    const isOwner = campaign.dm_id === user.id;
    if (!isOwner) await this.assertActiveMember(id, user.id);

    const sessions = await this.db.execute(
      isOwner
        ? 'SELECT * FROM sessions WHERE campaign_id = ? ORDER BY created_at DESC'
        : `SELECT * FROM sessions WHERE campaign_id = ? AND visible_to_players = 1 ORDER BY created_at DESC`,
      [id],
    );

    const members = await this.db.execute(
      `SELECT m.user_id, p.username, m.character_id, m.edit_unlocked, ch.name AS character_name,
              ch.race AS character_race, ch.class AS character_class, ch.level AS character_level,
              ch.data AS character_data
       FROM campaign_members m
       JOIN profiles p ON p.id = m.user_id
       JOIN characters ch ON ch.id = m.character_id
       WHERE m.campaign_id = ? AND m.status = 'active'
       ORDER BY m.joined_at ASC`,
      [id],
    );

    return {
      ...this.deserialize(campaign),
      sessions: sessions.rows,
      members: members.rows.map((row) => this.deserializeMember(row)),
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
        source.level,
        source.data,
        campaign.id,
        now,
        now,
      ],
    );

    const membershipId = randomUUID();
    await this.db.execute(
      `INSERT INTO campaign_members (id, campaign_id, user_id, character_id, source_character_id)
       VALUES (?, ?, ?, ?, ?)`,
      [membershipId, campaign.id, user.id, copyId, dto.characterId],
    );

    return this.findOne(campaign.id as string, user);
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
    await this.db.execute(
      `UPDATE campaign_members SET status = 'removed' WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
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
  private deserializeMember(row: Record<string, unknown>) {
    const data = this.db.parseJson<Record<string, unknown>>(
      row.character_data as string,
      {},
    );
    return {
      user_id: row.user_id,
      username: row.username,
      character_id: row.character_id,
      edit_unlocked: !!row.edit_unlocked,
      character_name: row.character_name,
      character_race: row.character_race,
      character_class: row.character_class,
      character_level: row.character_level,
      character_max_hp: data.max_hp ?? null,
      character_current_hp: data.current_hp ?? null,
      character_armor_class: data.armor_class ?? null,
    };
  }

  private deserialize(row: Record<string, unknown>) {
    const data = this.db.parseJson(row.data as string, {});
    return {
      ...(data as Record<string, unknown>),
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
}
