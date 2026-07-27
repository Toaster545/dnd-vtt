import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';

@Injectable()
export class EncountersService {
  constructor(private db: DatabaseService) {}

  async findAllForUser(dmId: string) {
    const result = await this.db.execute(
      'SELECT * FROM encounters WHERE dm_id = ? ORDER BY created_at DESC',
      [dmId],
    );
    return result.rows.map(r => this.deserialize(r));
  }

  async findOne(id: string, dmId: string) {
    const result = await this.db.execute('SELECT * FROM encounters WHERE id = ?', [id]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Encounter not found');
    if (row.dm_id !== dmId) throw new ForbiddenException();
    return this.deserialize(row);
  }

  async create(dmId: string, dto: CreateEncounterDto) {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO encounters (id, dm_id, name, map_id, monsters, character_ids)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id, dmId, dto.name, dto.map_id ?? null,
        JSON.stringify(dto.monsters ?? []), JSON.stringify(dto.character_ids ?? []),
      ],
    );
    return this.findOne(id, dmId);
  }

  async update(id: string, dmId: string, body: Record<string, unknown>) {
    const current = await this.findOne(id, dmId);
    const name          = (body.name as string | undefined) ?? current.name;
    const map_id         = body.map_id !== undefined ? (body.map_id as string | null) : current.map_id;
    const monsters       = body.monsters !== undefined ? body.monsters : current.monsters;
    const character_ids  = body.character_ids !== undefined ? body.character_ids : current.character_ids;
    await this.db.execute(
      `UPDATE encounters SET name=?, map_id=?, monsters=?, character_ids=?, updated_at=? WHERE id=?`,
      [name, map_id, JSON.stringify(monsters), JSON.stringify(character_ids), new Date().toISOString(), id],
    );
    return this.findOne(id, dmId);
  }

  async remove(id: string, dmId: string) {
    await this.findOne(id, dmId);
    await this.db.execute('DELETE FROM encounters WHERE id = ?', [id]);
    return { deleted: true };
  }

  // Unambiguous alphabet — no 0/O/1/I — since a DM reads this out loud or over chat for players
  // to type back in.
  private static readonly CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  private generateJoinCode(): string {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += EncountersService.CODE_ALPHABET[Math.floor(Math.random() * EncountersService.CODE_ALPHABET.length)];
    }
    return code;
  }

  async start(id: string, dmId: string) {
    await this.findOne(id, dmId);
    let code: string;
    do {
      code = this.generateJoinCode();
    } while ((await this.db.execute(
      `SELECT id FROM encounters WHERE join_code = ? AND status = 'active'`, [code],
    )).rows.length > 0);

    await this.db.execute(
      `UPDATE encounters SET status='active', join_code=?, updated_at=? WHERE id=?`,
      [code, new Date().toISOString(), id],
    );
    return this.findOne(id, dmId);
  }

  async stop(id: string, dmId: string) {
    await this.findOne(id, dmId);
    await this.db.execute(
      `UPDATE encounters SET status='ended', join_code=NULL, updated_at=? WHERE id=?`,
      [new Date().toISOString(), id],
    );
    return this.findOne(id, dmId);
  }

  // No dmId/ownership check — this is the one lookup a player (who owns no encounters) needs to
  // be able to do, resolving a code to the encounter regardless of who's asking.
  async findByJoinCode(code: string) {
    const result = await this.db.execute(
      `SELECT * FROM encounters WHERE join_code = ? AND status = 'active'`,
      [code.trim().toUpperCase()],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('No active encounter with that code');
    return this.deserialize(row);
  }

  private deserialize(row: Record<string, unknown>) {
    // Older rows may still carry the pre-simplification `{ monsterIndex, quantity }` shape;
    // normalize to plain indices so callers never have to care which shape a given row used.
    const monsters = this.db.parseJson<unknown[]>(row.monsters as string, [])
      .map(m => (typeof m === 'string' ? m : (m as { monsterIndex: string }).monsterIndex));

    return {
      id: row.id,
      dm_id: row.dm_id,
      session_id: row.session_id,
      name: row.name,
      map_id: row.map_id,
      monsters,
      character_ids: this.db.parseJson(row.character_ids as string, []),
      status: row.status,
      join_code: row.join_code,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
