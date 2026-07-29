import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from '../common/database.service';
import { ContentService } from '../content/content.service';
import { TokensGateway } from './tokens.gateway';

@Injectable()
export class MapsService {
  constructor(
    private db: DatabaseService,
    private gateway: TokensGateway,
    private content: ContentService,
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
      [
        id,
        body.campaign_id ?? 'default',
        body.name,
        body.image_url,
        body.grid_size ?? 50,
      ],
    );
    return this.findOne(id);
  }

  async uploadImage(
    file: Express.Multer.File,
    campaignId: string,
  ): Promise<string> {
    const uploadDir = join(process.cwd(), 'uploads', 'maps', campaignId);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    const filepath = join(uploadDir, filename);
    writeFileSync(filepath, file.buffer);

    // Deliberately relative, not an absolute `http://host:port/...` URL: per CLAUDE.md this app is
    // single-origin (the browser always loads the frontend from the same host/port it should fetch
    // uploads from, whether that's localhost:3000 directly or a domain fronted by a Cloudflare
    // Tunnel). A baked-in absolute host would only ever be right for one of those, and baking in
    // `http://` specifically breaks entirely once the tunnel serves the app over https (browsers
    // block that as mixed content).
    return `/uploads/maps/${campaignId}/${filename}`;
  }

  async getTokens(mapId: string) {
    const result = await this.db.execute(
      'SELECT * FROM map_tokens WHERE map_id = ?',
      [mapId],
    );
    return result.rows.map((r) => ({ ...r, is_player: !!r.is_player }));
  }

  async upsertToken(mapId: string, token: Record<string, unknown>) {
    const isNew = !token.id;
    const id = (token.id as string) || randomUUID();

    // New enemy tokens roll their own initiative on the spot; a player token is placed with no
    // initiative until the DM enters the player's roll. Explicit values (edits, rerolls) pass
    // through untouched — this only fires for a brand-new monster token.
    let initiative = (token.initiative as number | null | undefined) ?? null;
    if (
      isNew &&
      !token.is_player &&
      token.monster_index &&
      initiative == null
    ) {
      initiative = this.rollMonsterInitiative(token.monster_index as string);
    }

    await this.db.execute(
      `INSERT INTO map_tokens (id, map_id, label, color, x, y, size, hp, max_hp, is_player, character_id, monster_index, initiative)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, color=excluded.color,
         x=excluded.x, y=excluded.y, size=excluded.size,
         hp=excluded.hp, max_hp=excluded.max_hp, is_player=excluded.is_player,
         character_id=excluded.character_id, monster_index=excluded.monster_index,
         initiative=excluded.initiative`,
      [
        id,
        mapId,
        token.label ?? 'Token',
        token.color ?? '#e74c3c',
        token.x ?? 0,
        token.y ?? 0,
        token.size ?? 1,
        token.hp ?? null,
        token.max_hp ?? null,
        token.is_player ? 1 : 0,
        token.character_id ?? null,
        token.monster_index ?? null,
        initiative,
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

  async rerollInitiative(mapId: string, tokenId: string) {
    const result = await this.db.execute(
      'SELECT monster_index FROM map_tokens WHERE id = ? AND map_id = ?',
      [tokenId, mapId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Token not found');
    if (!row.monster_index)
      throw new BadRequestException(
        'Only monster tokens can reroll initiative',
      );

    const initiative = this.rollMonsterInitiative(row.monster_index as string);
    await this.db.execute('UPDATE map_tokens SET initiative = ? WHERE id = ?', [
      initiative,
      tokenId,
    ]);
    const tokens = await this.getTokens(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t: any) => t.id === tokenId);
  }

  // `hidden_cells` empty means every cell is visible — a freshly-enabled map starts fully
  // revealed, and the DM paints/rect-selects areas to hide rather than areas to reveal.
  async getFog(mapId: string) {
    const result = await this.db.execute(
      'SELECT * FROM map_fog WHERE map_id = ?',
      [mapId],
    );
    const row = result.rows[0];
    if (!row) return { enabled: false, hidden_cells: [] as string[] };
    return {
      enabled: !!row.enabled,
      hidden_cells: this.db.parseJson<string[]>(
        row.hidden_cells as string,
        [],
      ),
    };
  }

  async setFogEnabled(mapId: string, enabled: boolean) {
    const fog = await this.getFog(mapId);
    await this.upsertFog(mapId, enabled, fog.hidden_cells);
    return this.broadcastFog(mapId);
  }

  // `revealed: true` un-hides the painted cells, `false` hides them — same signature as before
  // the hidden/revealed flip, just inverted internally.
  async paintFog(
    mapId: string,
    cells: { col: number; row: number }[],
    revealed: boolean,
  ) {
    const fog = await this.getFog(mapId);
    const cellSet = new Set(fog.hidden_cells);
    for (const { col, row } of cells) {
      const key = `${col},${row}`;
      if (revealed) cellSet.delete(key);
      else cellSet.add(key);
    }
    await this.upsertFog(mapId, fog.enabled, [...cellSet]);
    return this.broadcastFog(mapId);
  }

  // "Reset" now means "back to the fully-visible default" — clears whatever's been hidden.
  async resetFog(mapId: string) {
    const fog = await this.getFog(mapId);
    await this.upsertFog(mapId, fog.enabled, []);
    return this.broadcastFog(mapId);
  }

  private async upsertFog(
    mapId: string,
    enabled: boolean,
    hiddenCells: string[],
  ) {
    await this.db.execute(
      `INSERT INTO map_fog (map_id, enabled, hidden_cells) VALUES (?,?,?)
       ON CONFLICT(map_id) DO UPDATE SET
         enabled=excluded.enabled, hidden_cells=excluded.hidden_cells`,
      [mapId, enabled ? 1 : 0, JSON.stringify(hiddenCells)],
    );
  }

  private async broadcastFog(mapId: string) {
    const fog = await this.getFog(mapId);
    this.gateway.broadcastFog(mapId, fog);
    return fog;
  }

  private rollMonsterInitiative(monsterIndex: string): number | null {
    try {
      const monster = this.content.getMonster(monsterIndex) as {
        ability_scores?: { dexterity?: number };
        initiative_bonus?: number;
      };
      let bonus = monster.initiative_bonus;
      if (bonus == null) {
        const dex = monster.ability_scores?.dexterity;
        if (dex == null) return null;
        bonus = Math.floor((dex - 10) / 2);
      }
      return Math.floor(Math.random() * 20) + 1 + bonus;
    } catch {
      return null;
    }
  }
}
