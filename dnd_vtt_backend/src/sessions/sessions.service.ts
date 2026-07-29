import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { CreateSessionDto } from './dto/create-session.dto';
import type { RequestUser } from '../common/current-user.decorator';

@Injectable()
export class SessionsService {
  constructor(private db: DatabaseService) {}

  // Sessions within a campaign, for whoever the caller is: the owning DM sees everything
  // (including sessions not yet revealed, for planning ahead); an active campaign member only
  // sees sessions the DM has revealed (`visible_to_players`).
  async findAllForCampaign(campaignId: string, user: RequestUser) {
    const campaign = await this.db.execute(
      'SELECT * FROM campaigns WHERE id = ?',
      [campaignId],
    );
    const campaignRow = campaign.rows[0];
    if (!campaignRow) throw new NotFoundException('Campaign not found');

    const isOwner = campaignRow.dm_id === user.id;
    if (!isOwner) await this.assertActiveMember(campaignId, user.id);

    const result = await this.db.execute(
      isOwner
        ? 'SELECT * FROM sessions WHERE campaign_id = ? ORDER BY created_at DESC'
        : `SELECT * FROM sessions WHERE campaign_id = ? AND visible_to_players = 1 ORDER BY created_at DESC`,
      [campaignId],
    );
    return result.rows;
  }

  private async assertActiveMember(campaignId: string, userId: string) {
    const membership = await this.db.execute(
      `SELECT id FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, userId],
    );
    if (membership.rows.length === 0) throw new ForbiddenException();
  }

  async findOne(id: string) {
    const result = await this.db.execute(
      'SELECT * FROM sessions WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Session not found');
    return row;
  }

  async create(dmId: string, dto: CreateSessionDto) {
    const id = randomUUID();
    await this.db.execute(
      'INSERT INTO sessions (id, name, description, dm_id, campaign_id) VALUES (?, ?, ?, ?, ?)',
      [id, dto.name, dto.description ?? '', dmId, dto.campaign_id],
    );
    return this.findOne(id);
  }

  async setVisibility(id: string, dmId: string, visible: boolean) {
    const session = await this.findOne(id);
    if (session.dm_id !== dmId) throw new ForbiddenException();
    await this.db.execute(
      'UPDATE sessions SET visible_to_players = ? WHERE id = ?',
      [visible ? 1 : 0, id],
    );
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM sessions WHERE id = ?', [id]);
    return { deleted: true };
  }
}
