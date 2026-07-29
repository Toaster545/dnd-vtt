import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { generateJoinCode } from '../common/join-code.util';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { JoinCampaignDto } from './dto/join-campaign.dto';
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
      `SELECT m.user_id, p.username, m.character_id, ch.name AS character_name
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
      members: members.rows,
    };
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

  private deserialize(row: Record<string, unknown>) {
    const data = this.db.parseJson(row.data as string, {});
    return {
      ...(data as Record<string, unknown>),
      id: row.id,
      dm_id: row.dm_id,
      name: row.name,
      description: row.description,
      join_code: row.join_code,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
