import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { CreateNoteDto, NoteEntityType } from './dto/create-note.dto';
import type { RequestUser } from '../common/current-user.decorator';

interface EntityAccess {
  isOwner: boolean;
}

@Injectable()
export class NotesService {
  constructor(private db: DatabaseService) {}

  async list(entityType: NoteEntityType, entityId: string, user: RequestUser) {
    const { isOwner } = await this.assertAccess(entityType, entityId, user);
    const result = await this.db.execute(
      isOwner
        ? `SELECT n.*, p.username FROM notes n JOIN profiles p ON p.id = n.author_id
           WHERE entity_type = ? AND entity_id = ? ORDER BY n.created_at ASC`
        : `SELECT n.*, p.username FROM notes n JOIN profiles p ON p.id = n.author_id
           WHERE entity_type = ? AND entity_id = ? AND visibility = 'shared' ORDER BY n.created_at ASC`,
      [entityType, entityId],
    );
    return result.rows;
  }

  async create(user: RequestUser, dto: CreateNoteDto) {
    const { isOwner } = await this.assertAccess(
      dto.entityType,
      dto.entityId,
      user,
    );
    // Only the owning DM may post a private note; everyone else's notes are always shared.
    const visibility =
      dto.visibility === 'dm_only' && isOwner ? 'dm_only' : 'shared';
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO notes (id, entity_type, entity_id, author_id, visibility, content)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, dto.entityType, dto.entityId, user.id, visibility, dto.content],
    );
    return this.findOne(id);
  }

  async update(id: string, user: RequestUser, content: string) {
    const note = await this.findOne(id);
    const { isOwner } = await this.assertAccess(
      note.entity_type as NoteEntityType,
      note.entity_id as string,
      user,
    );
    if (note.author_id !== user.id && !isOwner) throw new ForbiddenException();
    await this.db.execute(
      `UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`,
      [content, new Date().toISOString(), id],
    );
    return this.findOne(id);
  }

  async remove(id: string, user: RequestUser) {
    const note = await this.findOne(id);
    const { isOwner } = await this.assertAccess(
      note.entity_type as NoteEntityType,
      note.entity_id as string,
      user,
    );
    if (note.author_id !== user.id && !isOwner) throw new ForbiddenException();
    await this.db.execute('DELETE FROM notes WHERE id = ?', [id]);
    return { deleted: true };
  }

  private async findOne(id: string) {
    const result = await this.db.execute('SELECT * FROM notes WHERE id = ?', [
      id,
    ]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Note not found');
    return row;
  }

  // Same "owner or visible-to-active-member" rule used by sessions/encounters, resolved per
  // entity type here rather than pulling in SessionsService/EncountersService for one query each.
  private async assertAccess(
    entityType: NoteEntityType,
    entityId: string,
    user: RequestUser,
  ): Promise<EntityAccess> {
    let dmId: string;
    let campaignId: string;
    let visible = true;

    if (entityType === 'campaign') {
      const result = await this.db.execute(
        'SELECT * FROM campaigns WHERE id = ?',
        [entityId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException('Campaign not found');
      dmId = row.dm_id as string;
      campaignId = row.id as string;
    } else if (entityType === 'session') {
      const result = await this.db.execute(
        'SELECT * FROM sessions WHERE id = ?',
        [entityId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException('Session not found');
      dmId = row.dm_id as string;
      campaignId = row.campaign_id as string;
      visible = !!row.visible_to_players;
    } else {
      const result = await this.db.execute(
        'SELECT * FROM encounters WHERE id = ?',
        [entityId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException('Encounter not found');
      dmId = row.dm_id as string;
      visible = !!row.visible_to_players;
      const session = await this.db.execute(
        'SELECT campaign_id FROM sessions WHERE id = ?',
        [row.session_id],
      );
      campaignId = session.rows[0]?.campaign_id as string;
    }

    if (user.id === dmId) return { isOwner: true };

    const membership = await this.db.execute(
      `SELECT id FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, user.id],
    );
    if (membership.rows.length === 0 || !visible)
      throw new ForbiddenException();
    return { isOwner: false };
  }
}
