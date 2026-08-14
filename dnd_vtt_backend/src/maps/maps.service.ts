import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from '../common/database.service';
import { ContentService } from '../content/content.service';
import { TokensGateway } from './tokens.gateway';
import type { RequestUser } from '../common/current-user.decorator';

@Injectable()
export class MapsService {
  constructor(
    private db: DatabaseService,
    private gateway: TokensGateway,
    private content: ContentService,
  ) {}

  async findAll(campaignId: string, user: RequestUser) {
    await this.assertCampaignAccess(campaignId, user);
    const result = await this.db.execute(
      'SELECT * FROM battle_maps WHERE campaign_id = ? ORDER BY created_at DESC',
      [campaignId],
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

  async create(body: Record<string, unknown>, user: RequestUser) {
    const campaignId = (body.campaign_id as string | undefined) ?? 'default';
    await this.assertCampaignAccess(campaignId, user);
    const id = randomUUID();
    await this.db.execute(
      'INSERT INTO battle_maps (id, campaign_id, name, image_url, grid_size) VALUES (?,?,?,?,?)',
      [id, campaignId, body.name, body.image_url, body.grid_size ?? 50],
    );
    return this.findOne(id);
  }

  async uploadImage(
    file: Express.Multer.File,
    campaignId: string,
    user: RequestUser,
  ): Promise<string> {
    await this.assertCampaignAccess(campaignId, user);
    return this.saveImage(file, campaignId);
  }

  private saveImage(
    file: Express.Multer.File,
    campaignId: string,
  ): Promise<string> {
    const uploadDir = join(process.cwd(), 'uploads', 'maps', campaignId);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    const filepath = join(uploadDir, filename);
    writeFileSync(filepath, file.buffer);

    return Promise.resolve(`/uploads/maps/${campaignId}/${filename}`);
  }

  async getTokens(mapId: string): Promise<Record<string, unknown>[]> {
    const result = await this.db.execute(
      'SELECT * FROM map_tokens WHERE map_id = ?',
      [mapId],
    );
    return result.rows.map((r) => ({ ...r, is_player: !!r.is_player }));
  }

  async upsertToken(
    mapId: string,
    token: Record<string, unknown>,
    user: RequestUser,
  ) {
    await this.assertMapAccess(mapId, user);
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
      initiative = await this.rollMonsterInitiative(
        token.monster_index as string,
      );
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
    return tokens.find((t) => t.id === id);
  }

  async deleteToken(tokenId: string, mapId: string, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    await this.db.execute('DELETE FROM map_tokens WHERE id = ?', [tokenId]);
    const tokens = await this.getTokens(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    // A light attached to this token cascades away with it (map_lights.token_id ON DELETE
    // CASCADE) — tell already-connected clients so an attached torch doesn't linger on screen.
    await this.broadcastLighting(mapId);
    return { deleted: true };
  }

  // Narrow carve-out alongside the DM-only upsertToken above: a player may recolor their own
  // character's token (cosmetic only) without the full map-mutation access `assertMapAccess`
  // demands. Anyone else's token, or a non-hex color, is rejected.
  async setTokenColor(
    mapId: string,
    tokenId: string,
    color: string,
    user: RequestUser,
  ) {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new BadRequestException('Color must be a hex string like #a1b2c3');
    }
    const map = await this.findOne(mapId);
    const result = await this.db.execute(
      'SELECT * FROM map_tokens WHERE id = ? AND map_id = ?',
      [tokenId, mapId],
    );
    const token = result.rows[0];
    if (!token) throw new NotFoundException('Token not found');

    const isDm = await this.isCampaignDm(map.campaign_id as string, user);
    if (!isDm) {
      if (!token.is_player || !token.character_id)
        throw new ForbiddenException();
      const owns = await this.db.execute(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [token.character_id, user.id],
      );
      if (!owns.rows[0]) throw new ForbiddenException();
    }

    await this.db.execute('UPDATE map_tokens SET color = ? WHERE id = ?', [
      color,
      tokenId,
    ]);
    const tokens = await this.getTokens(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t) => t.id === tokenId);
  }

  async rerollInitiative(mapId: string, tokenId: string, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
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

    const initiative = await this.rollMonsterInitiative(
      row.monster_index as string,
    );
    await this.db.execute('UPDATE map_tokens SET initiative = ? WHERE id = ?', [
      initiative,
      tokenId,
    ]);
    const tokens = await this.getTokens(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t) => t.id === tokenId);
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
      hidden_cells: this.db.parseJson<string[]>(row.hidden_cells as string, []),
    };
  }

  async setFogEnabled(mapId: string, enabled: boolean, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
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
    user: RequestUser,
  ) {
    await this.assertMapAccess(mapId, user);
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
  async resetFog(mapId: string, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
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

  // Dynamic lighting/darkness — independent of fog of war. `map_lighting.enabled` is the
  // per-map lit/dark toggle; `map_lights` holds DM-placed torches, each either standalone
  // (x/y set, token_id null) or attached to a token (token_id set, x/y left null — the light's
  // live position is derived from the token on the frontend, never persisted here).
  async getLighting(mapId: string) {
    const lightingResult = await this.db.execute(
      'SELECT * FROM map_lighting WHERE map_id = ?',
      [mapId],
    );
    const lightsResult = await this.db.execute(
      'SELECT * FROM map_lights WHERE map_id = ?',
      [mapId],
    );
    return {
      enabled: !!lightingResult.rows[0]?.enabled,
      lights: lightsResult.rows.map((r) => this.deserializeLight(r)),
    };
  }

  async setLightingEnabled(mapId: string, enabled: boolean, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    await this.upsertMapLighting(mapId, enabled);
    return this.broadcastLighting(mapId);
  }

  async upsertLight(
    mapId: string,
    light: Record<string, unknown>,
    user: RequestUser,
  ) {
    await this.assertMapAccess(mapId, user);

    const tokenId = (light.token_id as string | null | undefined) ?? null;
    if (tokenId) {
      const tokenResult = await this.db.execute(
        'SELECT id FROM map_tokens WHERE id = ? AND map_id = ?',
        [tokenId, mapId],
      );
      if (!tokenResult.rows[0])
        throw new BadRequestException('Token not found on this map');
    }
    // Attached lights never carry their own position — force it server-side regardless of
    // what the client sent, so an attached light can't drift out of sync with its token.
    const x = tokenId ? null : ((light.x as number | null | undefined) ?? null);
    const y = tokenId ? null : ((light.y as number | null | undefined) ?? null);
    if (!tokenId && (x == null || y == null))
      throw new BadRequestException('Standalone lights require x and y');

    const id = (light.id as string) || randomUUID();
    await this.db.execute(
      `INSERT INTO map_lights (id, map_id, token_id, x, y, bright_radius_ft, dim_radius_ft, color, enabled, label)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         token_id=excluded.token_id, x=excluded.x, y=excluded.y,
         bright_radius_ft=excluded.bright_radius_ft, dim_radius_ft=excluded.dim_radius_ft,
         color=excluded.color, enabled=excluded.enabled, label=excluded.label`,
      [
        id,
        mapId,
        tokenId,
        x,
        y,
        light.bright_radius_ft ?? 20,
        light.dim_radius_ft ?? 20,
        light.color ?? '#ffa542',
        light.enabled === false ? 0 : 1,
        light.label ?? 'Torch',
      ],
    );
    const lighting = await this.broadcastLighting(mapId);
    return lighting.lights.find((l) => l.id === id);
  }

  async deleteLight(lightId: string, mapId: string, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    await this.db.execute(
      'DELETE FROM map_lights WHERE id = ? AND map_id = ?',
      [lightId, mapId],
    );
    await this.broadcastLighting(mapId);
    return { deleted: true };
  }

  private deserializeLight(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      map_id: row.map_id as string,
      token_id: (row.token_id as string | null) ?? null,
      x: row.x != null ? Number(row.x) : null,
      y: row.y != null ? Number(row.y) : null,
      bright_radius_ft: Number(row.bright_radius_ft),
      dim_radius_ft: Number(row.dim_radius_ft),
      color: row.color as string,
      enabled: !!row.enabled,
      label: row.label as string,
    };
  }

  private async upsertMapLighting(mapId: string, enabled: boolean) {
    await this.db.execute(
      `INSERT INTO map_lighting (map_id, enabled) VALUES (?,?)
       ON CONFLICT(map_id) DO UPDATE SET enabled=excluded.enabled`,
      [mapId, enabled ? 1 : 0],
    );
  }

  private async broadcastLighting(mapId: string) {
    const lighting = await this.getLighting(mapId);
    this.gateway.broadcastLighting(mapId, lighting);
    return lighting;
  }

  private async assertCampaignAccess(campaignId: string, user: RequestUser) {
    if (campaignId === 'default') {
      if (user.role !== 'admin') throw new ForbiddenException();
      return;
    }
    const result = await this.db.execute(
      'SELECT dm_id FROM campaigns WHERE id = ?',
      [campaignId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Campaign not found');
    if (row.dm_id !== user.id) throw new ForbiddenException();
  }

  // Non-throwing version of assertCampaignAccess, for call sites (setTokenColor) that have a
  // legitimate non-DM path instead of treating "not the DM" as an error.
  private async isCampaignDm(
    campaignId: string,
    user: RequestUser,
  ): Promise<boolean> {
    if (campaignId === 'default') return user.role === 'admin';
    const result = await this.db.execute(
      'SELECT dm_id FROM campaigns WHERE id = ?',
      [campaignId],
    );
    const row = result.rows[0];
    return !!row && row.dm_id === user.id;
  }

  private async assertMapAccess(mapId: string, user: RequestUser) {
    const map = await this.findOne(mapId);
    await this.assertCampaignAccess(map.campaign_id as string, user);
  }

  private async rollMonsterInitiative(
    monsterIndex: string,
  ): Promise<number | null> {
    try {
      const monster = (await this.content.getMonster(monsterIndex)) as {
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
