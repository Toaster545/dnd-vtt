import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';

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
    await this.db.execute(
      `INSERT INTO characters
        (id, user_id, name, race, class, subclass, level, background, alignment,
         ability_scores, max_hp, current_hp, armor_class, speed, proficiency_bonus,
         skills, equipment, spells, notes, avatar_url, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, userId,
        body.name, body.race ?? '', body.class ?? '', body.subclass ?? '',
        body.level ?? 1, body.background ?? '', body.alignment ?? 'True Neutral',
        JSON.stringify(body.ability_scores ?? {}),
        body.max_hp ?? 10, body.current_hp ?? 10, body.armor_class ?? 10,
        body.speed ?? 30, body.proficiency_bonus ?? 2,
        JSON.stringify(body.skills ?? {}),
        JSON.stringify(body.equipment ?? []),
        JSON.stringify(body.spells ?? []),
        body.notes ?? '', body.avatar_url ?? null,
        now, now,
      ],
    );
    return this.findOne(id, userId);
  }

  async update(id: string, userId: string, body: Record<string, unknown>) {
    await this.findOne(id, userId);
    await this.db.execute(
      `UPDATE characters SET
        name=?, race=?, class=?, subclass=?, level=?, background=?, alignment=?,
        ability_scores=?, max_hp=?, current_hp=?, armor_class=?, speed=?,
        proficiency_bonus=?, skills=?, equipment=?, spells=?, notes=?, updated_at=?
       WHERE id=?`,
      [
        body.name, body.race ?? '', body.class ?? '', body.subclass ?? '',
        body.level ?? 1, body.background ?? '', body.alignment ?? 'True Neutral',
        JSON.stringify(body.ability_scores ?? {}),
        body.max_hp ?? 10, body.current_hp ?? 10, body.armor_class ?? 10,
        body.speed ?? 30, body.proficiency_bonus ?? 2,
        JSON.stringify(body.skills ?? {}),
        JSON.stringify(body.equipment ?? []),
        JSON.stringify(body.spells ?? []),
        body.notes ?? '', new Date().toISOString(),
        id,
      ],
    );
    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.db.execute('DELETE FROM characters WHERE id = ?', [id]);
    return { deleted: true };
  }

  private deserialize(row: Record<string, unknown>) {
    return {
      ...row,
      ability_scores: this.db.parseJson(row.ability_scores as string, {}),
      skills: this.db.parseJson(row.skills as string, {}),
      equipment: this.db.parseJson(row.equipment as string, []),
      spells: this.db.parseJson(row.spells as string, []),
    };
  }
}
