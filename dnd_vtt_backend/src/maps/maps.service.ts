import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from '../common/database.service';
import { TokensGateway } from './tokens.gateway';

@Injectable()
export class MapsService {
  constructor(
    private db: DatabaseService,
    private gateway: TokensGateway,
  ) {}

  async findAll() {
    const result = await this.db.execute(
      'SELECT * FROM battle_maps ORDER BY created_at DESC',
    );
    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.execute(
      'SELECT * FROM battle_maps WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Map not found');
    return row;
  }

  async create(body: Record<string, unknown>) {
    const id = randomUUID();
    await this.db.execute(
      'INSERT INTO battle_maps (id, campaign_id, name, image_url, grid_size) VALUES (?,?,?,?,?)',
      [id, body.campaign_id ?? 'default', body.name, body.image_url, body.grid_size ?? 50],
    );
    return this.findOne(id);
  }

  async uploadImage(file: Express.Multer.File, campaignId: string): Promise<string> {
    const uploadDir = join(process.cwd(), 'uploads', 'maps', campaignId);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    const filepath = join(uploadDir, filename);
    writeFileSync(filepath, file.buffer);

    const baseUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';
    return `${baseUrl}/uploads/maps/${campaignId}/${filename}`;
  }

  async getTokens(mapId: string) {
    const result = await this.db.execute(
      'SELECT * FROM map_tokens WHERE map_id = ?',
      [mapId],
    );
    return result.rows.map(r => ({ ...r, is_player: !!r.is_player }));
  }

  async upsertToken(mapId: string, token: Record<string, unknown>) {
    const id = (token.id as string) || randomUUID();
    await this.db.execute(
      `INSERT INTO map_tokens (id, map_id, label, color, x, y, size, hp, max_hp, is_player)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, color=excluded.color,
         x=excluded.x, y=excluded.y, size=excluded.size,
         hp=excluded.hp, max_hp=excluded.max_hp, is_player=excluded.is_player`,
      [
        id, mapId,
        token.label ?? 'Token', token.color ?? '#e74c3c',
        token.x ?? 0, token.y ?? 0, token.size ?? 1,
        token.hp ?? null, token.max_hp ?? null,
        token.is_player ? 1 : 0,
      ],
    );
    const tokens = await this.getTokens(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t: any) => t.id === id);
  }

  async deleteToken(tokenId: string, mapId: string) {
    await this.db.execute('DELETE FROM map_tokens WHERE id = ?', [tokenId]);
    const tokens = await this.getTokens(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return { deleted: true };
  }
}
