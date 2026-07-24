import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionsService {
  constructor(private db: DatabaseService) {}

  async findAll() {
    const result = await this.db.execute(
      'SELECT * FROM sessions ORDER BY created_at DESC',
    );
    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.execute(
      'SELECT * FROM sessions WHERE id = ?', [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Session not found');
    return row;
  }

  async create(dmId: string, dto: CreateSessionDto) {
    const id = randomUUID();
    await this.db.execute(
      'INSERT INTO sessions (id, name, description, dm_id) VALUES (?, ?, ?, ?)',
      [id, dto.name, dto.description ?? '', dmId],
    );
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM sessions WHERE id = ?', [id]);
    return { deleted: true };
  }
}
