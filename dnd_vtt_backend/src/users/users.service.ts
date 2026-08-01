import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../common/database.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private db: DatabaseService) {}

  async findAll() {
    const result = await this.db.execute(
      'SELECT id, email, username, role, created_at FROM profiles ORDER BY created_at ASC',
    );
    return result.rows;
  }

  async update(id: string, actingUserId: string, dto: UpdateUserDto) {
    await this.getRow(id);

    if (dto.role && dto.role !== 'admin' && id === actingUserId) {
      throw new BadRequestException('You cannot remove your own admin role');
    }
    if (dto.role && dto.role !== 'admin') {
      await this.assertNotLastAdmin(id);
    }

    if (dto.email || dto.username) {
      const clash = await this.db.execute(
        'SELECT id FROM profiles WHERE (email = ? OR username = ?) AND id != ?',
        [dto.email ?? '', dto.username ?? '', id],
      );
      if (clash.rows.length) {
        throw new BadRequestException('Email or username already in use');
      }
    }

    const sets: string[] = [];
    const args: unknown[] = [];
    if (dto.username !== undefined) { sets.push('username = ?'); args.push(dto.username); }
    if (dto.email !== undefined) { sets.push('email = ?'); args.push(dto.email); }
    if (dto.role !== undefined) { sets.push('role = ?'); args.push(dto.role); }
    if (dto.password !== undefined) {
      sets.push('password_hash = ?');
      args.push(await bcrypt.hash(dto.password, 10));
    }
    if (sets.length) {
      args.push(id);
      await this.db.execute(
        `UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`,
        args,
      );
    }

    return this.getRow(id);
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const row = await this.getRow(id);
    if (row.role === 'admin') await this.assertNotLastAdmin(id);
    await this.db.execute('DELETE FROM profiles WHERE id = ?', [id]);
    return { message: 'Account deleted' };
  }

  private async getRow(id: string) {
    const result = await this.db.execute(
      'SELECT id, email, username, role, created_at FROM profiles WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('User not found');
    return row;
  }

  private async assertNotLastAdmin(excludingId: string) {
    const admins = await this.db.execute(
      "SELECT id FROM profiles WHERE role = 'admin' AND id != ?",
      [excludingId],
    );
    if (admins.rows.length === 0) {
      throw new BadRequestException('At least one admin account must remain');
    }
  }
}
