import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';

// Top-level columns kept for fast listing/filtering
const LIST_FIELDS = ['name', 'race', 'class', 'level'] as const;

@Injectable()
export class CharactersService {
  constructor(private db: DatabaseService) {}

  async findAllForUser(userId: string) {
    const result = await this.db.execute(
      'SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map(r => this.deserialize(r));
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

  async create(userId: string, body: Record<string, unknown>) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { name, race, class: cls, level, ...rest } = body;
    await this.db.execute(
      `INSERT INTO characters (id, user_id, name, race, class, level, data, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, userId, name ?? 'Unnamed', race ?? '', cls ?? '', level ?? 1, JSON.stringify(rest), now, now],
    );
    return this.findOne(id, userId);
  }

  async update(id: string, userId: string, body: Record<string, unknown>) {
    await this.findOne(id, userId);
    const { name, race, class: cls, level, ...rest } = body;
    await this.db.execute(
      `UPDATE characters SET name=?, race=?, class=?, level=?, data=?, updated_at=? WHERE id=?`,
      [name ?? 'Unnamed', race ?? '', cls ?? '', level ?? 1, JSON.stringify(rest), new Date().toISOString(), id],
    );
    return this.findOne(id, userId);
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
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
