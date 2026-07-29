import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import type { RequestUser } from '../common/current-user.decorator';

// Top-level columns kept for fast listing/filtering
const LIST_FIELDS = ['name', 'race', 'class', 'level'] as const;

@Injectable()
export class CharactersService {
  constructor(private db: DatabaseService) {}

  // Template characters only — campaign copies (campaign_id set) are DM-editable clones fetched
  // through the campaigns endpoints instead, so they don't clutter the list a player picks from
  // when joining a new campaign.
  async findAllForUser(userId: string) {
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE user_id = ? AND campaign_id IS NULL ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map((r) => this.deserialize(r));
  }

  async findOne(id: string, userId: string) {
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Character not found');
    if (row.user_id !== userId) throw new ForbiddenException();
    return this.deserialize(row);
  }

  // Same lookup, but a DM (admin) can read/edit any character, not just ones their own account
  // happens to own. This app is single-campaign self-hosted (see CLAUDE.md) — "admin" means the
  // DM running the game, who needs to see and manage whatever character a player actually brings
  // into an encounter, not just characters created under the DM's own login.
  async findOneReadable(id: string, user: RequestUser) {
    if (user.role !== 'admin') return this.findOne(id, user.id);
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Character not found');
    return this.deserialize(row);
  }

  async create(userId: string, body: Record<string, unknown>) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { name, race, class: cls, level, ...rest } = body;
    await this.db.execute(
      `INSERT INTO characters (id, user_id, name, race, class, level, data, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        userId,
        name ?? 'Unnamed',
        race ?? '',
        cls ?? '',
        level ?? 1,
        JSON.stringify(rest),
        now,
        now,
      ],
    );
    return this.findOne(id, userId);
  }

  async update(id: string, user: RequestUser, body: Record<string, unknown>) {
    const existing = await this.findOneReadable(id, user);
    // A campaign copy can only be edited by the DM (point 5 of the campaigns spec) — the player
    // still owns the row for read purposes, but shouldn't be able to change the DM's live copy.
    if (existing.campaign_id && user.role !== 'admin')
      throw new ForbiddenException();
    const { name, race, class: cls, level, ...rest } = body;
    await this.db.execute(
      `UPDATE characters SET name=?, race=?, class=?, level=?, data=?, updated_at=? WHERE id=?`,
      [
        name ?? 'Unnamed',
        race ?? '',
        cls ?? '',
        level ?? 1,
        JSON.stringify(rest),
        new Date().toISOString(),
        id,
      ],
    );
    return this.findOneReadable(id, user);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.db.execute('DELETE FROM characters WHERE id = ?', [id]);
    return { deleted: true };
  }

  private deserialize(row: Record<string, unknown>) {
    const data = this.db.parseJson(row.data as string, {});
    return {
      ...(data as Record<string, unknown>),
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      race: row.race,
      class: row.class,
      level: row.level,
      campaign_id: row.campaign_id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
