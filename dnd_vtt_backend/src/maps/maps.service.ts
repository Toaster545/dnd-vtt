import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { DatabaseService } from '../common/database.service';
import { ContentService } from '../content/content.service';
import { TokensGateway } from './tokens.gateway';
import type { RequestUser } from '../common/current-user.decorator';
import { serializePlayerTokens } from './player-tokens';
import { moveCost } from './movement';

// A light-blocking wall segment, in fractional grid units (see applyV26).
export interface MapWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Generous for a hand-drawn map; a large .dd2vtt dungeon export is typically a few hundred.
const MAX_WALLS = 5000;

@Injectable()
export class MapsService {
  constructor(
    private db: DatabaseService,
    private gateway: TokensGateway,
    private content: ContentService,
  ) {}

  async findAll(campaignId: string, user: RequestUser) {
    const isDm = await this.isCampaignDm(campaignId, user);
    if (!isDm) {
      const membership = await this.db.execute(
        `SELECT id FROM campaign_members
         WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
        [campaignId, user.id],
      );
      if (!membership.rows[0]) throw new ForbiddenException();
    }
    const result = await this.db.execute(
      isDm
        ? `SELECT * FROM battle_maps WHERE campaign_id = ? ORDER BY created_at DESC`
        : `SELECT DISTINCT bm.* FROM battle_maps bm
           JOIN encounter_levels el ON el.map_id = bm.id
           JOIN encounters e ON e.id = el.encounter_id
           JOIN sessions s ON s.id = e.session_id
           WHERE bm.campaign_id = ? AND s.visible_to_players = 1
             AND e.visible_to_players = 1
           ORDER BY bm.created_at DESC`,
      [campaignId],
    );
    return result.rows.map((map) => this.serializeMap(map, isDm));
  }

  private async findOneRaw(id: string) {
    const result = await this.db.execute(
      'SELECT * FROM battle_maps WHERE id = ?',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Map not found');
    return row;
  }

  async findOne(id: string, user: RequestUser) {
    const access = await this.resolveMapReadAccess(id, user);
    return this.serializeMap(access.map, access.isDm);
  }

  async create(body: Record<string, unknown>, user: RequestUser) {
    const campaignId = (body.campaign_id as string | undefined) ?? 'default';
    await this.assertCampaignAccess(campaignId, user);
    const id = randomUUID();
    await this.db.execute(
      'INSERT INTO battle_maps (id, campaign_id, name, image_url, grid_size) VALUES (?,?,?,?,?)',
      [id, campaignId, body.name, body.image_url, body.grid_size ?? 50],
    );
    return this.findOneRaw(id);
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

  private async getTokensRaw(
    mapId: string,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.db.execute(
      'SELECT * FROM map_tokens WHERE map_id = ?',
      [mapId],
    );
    return result.rows.map((r) => ({ ...r, is_player: !!r.is_player }));
  }

  async getTokens(mapId: string, user: RequestUser) {
    const access = await this.resolveMapReadAccess(mapId, user);
    const tokens = await this.getTokensRaw(mapId);
    return access.isDm ? tokens : serializePlayerTokens(tokens);
  }

  async upsertToken(
    mapId: string,
    token: Record<string, unknown>,
    user: RequestUser,
  ) {
    const map = await this.assertMapAccess(mapId, user);
    const isNew = !token.id;
    const id = (token.id as string) || randomUUID();

    // A character is only ever in one place: placing one that already has a token on this map,
    // or on another level of an encounter this map belongs to, moves that token here instead —
    // keeping its initiative, so it still shows up exactly once in the turn order.
    if (isNew && typeof token.character_id === 'string') {
      const existing = await this.findCharacterToken(mapId, token.character_id);
      if (existing) {
        return this.relocateCharacterToken(
          existing,
          token.character_id,
          mapId,
          Number(token.x ?? 0),
          Number(token.y ?? 0),
          map.campaign_id as string,
        );
      }
    }

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
      `INSERT INTO map_tokens (id, map_id, label, color, x, y, size, hp, max_hp, is_player, character_id, monster_index, initiative, visible_to_players, name_visible_to_players)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, color=excluded.color,
         x=excluded.x, y=excluded.y, size=excluded.size,
         hp=excluded.hp, max_hp=excluded.max_hp, is_player=excluded.is_player,
         character_id=excluded.character_id, monster_index=excluded.monster_index,
         initiative=excluded.initiative,
         visible_to_players=excluded.visible_to_players,
         name_visible_to_players=excluded.name_visible_to_players`,
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
        token.visible_to_players === false ? 0 : 1,
        token.name_visible_to_players === false ? 0 : 1,
      ],
    );
    const tokens = await this.getTokensRaw(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t) => t.id === id);
  }

  // This character's token on `mapId` itself or on any other level of an encounter that
  // `mapId` is a level of.
  private async findCharacterToken(mapId: string, characterId: string) {
    const result = await this.db.execute(
      `SELECT id, map_id FROM map_tokens
       WHERE character_id = ?
         AND (map_id = ? OR map_id IN (
           SELECT other.map_id FROM encounter_levels mine
           JOIN encounter_levels other ON other.encounter_id = mine.encounter_id
           WHERE mine.map_id = ?))
       ORDER BY (map_id = ?) DESC
       LIMIT 1`,
      [characterId, mapId, mapId, mapId],
    );
    const row = result.rows[0];
    return row ? { id: row.id as string, map_id: row.map_id as string } : null;
  }

  private async relocateCharacterToken(
    existing: { id: string; map_id: string },
    characterId: string,
    mapId: string,
    x: number,
    y: number,
    campaignId: string,
  ) {
    await this.db.execute(
      // Mid-turn, the trail restarts on the new level (a ghost on another map would point
      // nowhere) but the confirmed distance already traveled this turn is kept.
      `UPDATE map_tokens SET map_id = ?, x = ?, y = ?,
         turn_start_x = CASE WHEN turn_start_x IS NULL THEN NULL ELSE ? END,
         turn_start_y = CASE WHEN turn_start_y IS NULL THEN NULL ELSE ? END,
         turn_anchor_x = CASE WHEN turn_anchor_x IS NULL THEN NULL ELSE ? END,
         turn_anchor_y = CASE WHEN turn_anchor_y IS NULL THEN NULL ELSE ? END,
         planned_x = NULL, planned_y = NULL
       WHERE id = ?`,
      [mapId, x, y, x, y, x, y, existing.id],
    );
    await this.db.execute(
      'UPDATE map_lights SET map_id = ? WHERE token_id = ?',
      [mapId, existing.id],
    );
    for (const id of new Set([existing.map_id, mapId])) {
      this.gateway.broadcastTokens(id, await this.getTokensRaw(id));
      await this.broadcastLighting(id);
    }
    this.gateway.notifyCharacterLevelChanged(campaignId, characterId);
    return this.findTokenRaw(existing.id);
  }

  async deleteToken(tokenId: string, mapId: string, user: RequestUser) {
    const map = await this.assertMapAccess(mapId, user);
    const existing = await this.db.execute(
      'SELECT character_id FROM map_tokens WHERE id = ?',
      [tokenId],
    );
    await this.db.execute('DELETE FROM map_tokens WHERE id = ?', [tokenId]);
    const tokens = await this.getTokensRaw(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    // A light attached to this token cascades away with it (map_lights.token_id ON DELETE
    // CASCADE) — tell already-connected clients so an attached torch doesn't linger on screen.
    await this.broadcastLighting(mapId);
    const characterId = existing.rows[0]?.character_id;
    if (typeof characterId === 'string') {
      this.gateway.notifyCharacterLevelChanged(
        map.campaign_id as string,
        characterId,
      );
    }
    return { deleted: true };
  }

  // Moves a token to another map of the same campaign — a multi-level encounter's stairs. Keeps
  // its position, HP, initiative etc.; any light attached to it moves along. Both maps' viewers
  // get a fresh token/lighting list, and a moved character token tells its player to follow it.
  async moveTokenToMap(
    tokenId: string,
    mapId: string,
    targetMapId: string,
    user: RequestUser,
  ) {
    const map = await this.assertMapAccess(mapId, user);
    const target = await this.findOneRaw(targetMapId);
    if (target.campaign_id !== map.campaign_id) {
      throw new BadRequestException('Target map belongs to another campaign');
    }
    const result = await this.db.execute(
      'SELECT character_id FROM map_tokens WHERE id = ? AND map_id = ?',
      [tokenId, mapId],
    );
    const token = result.rows[0];
    if (!token) throw new NotFoundException('Token not found');
    if (targetMapId === mapId) return this.findTokenRaw(tokenId);

    await this.db.execute('UPDATE map_tokens SET map_id = ? WHERE id = ?', [
      targetMapId,
      tokenId,
    ]);
    await this.db.execute(
      'UPDATE map_lights SET map_id = ? WHERE token_id = ?',
      [targetMapId, tokenId],
    );
    for (const id of [mapId, targetMapId]) {
      this.gateway.broadcastTokens(id, await this.getTokensRaw(id));
      await this.broadcastLighting(id);
    }
    if (typeof token.character_id === 'string') {
      this.gateway.notifyCharacterLevelChanged(
        map.campaign_id as string,
        token.character_id,
      );
    }
    return this.findTokenRaw(tokenId);
  }

  private async findTokenRaw(tokenId: string) {
    const result = await this.db.execute(
      'SELECT * FROM map_tokens WHERE id = ?',
      [tokenId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Token not found');
    return { ...row, is_player: !!row.is_player };
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
    await this.assertOwnTokenOrDm(mapId, tokenId, user);
    await this.db.execute('UPDATE map_tokens SET color = ? WHERE id = ?', [
      color,
      tokenId,
    ]);
    const tokens = await this.getTokensRaw(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t) => t.id === tokenId);
  }

  // The square this player would like their token moved to (see applyV30). Readable by the
  // token's owner (or the DM) only — the shared player broadcast never carries it, so other
  // players can't see it, and the DM's screen only shows it on that token's turn.
  async getTokenPlan(mapId: string, tokenId: string, user: RequestUser) {
    const token = await this.assertOwnTokenOrDm(mapId, tokenId, user);
    return this.planOf(token);
  }

  async setTokenPlan(
    mapId: string,
    tokenId: string,
    plan: { x: number; y: number } | null,
    user: RequestUser,
  ) {
    if (
      plan &&
      !(
        Number.isInteger(plan.x) &&
        Number.isInteger(plan.y) &&
        plan.x >= 0 &&
        plan.y >= 0
      )
    ) {
      throw new BadRequestException('Destination must be a grid square');
    }
    await this.assertOwnTokenOrDm(mapId, tokenId, user);
    await this.db.execute(
      'UPDATE map_tokens SET planned_x = ?, planned_y = ? WHERE id = ?',
      [plan?.x ?? null, plan?.y ?? null, tokenId],
    );
    this.gateway.broadcastTokens(mapId, await this.getTokensRaw(mapId));
    return plan;
  }

  private planOf(token: Record<string, unknown>) {
    return token.planned_x == null || token.planned_y == null
      ? null
      : { x: Number(token.planned_x), y: Number(token.planned_y) };
  }

  // A player may act on their own character's token; the campaign's DM on any token.
  private async assertOwnTokenOrDm(
    mapId: string,
    tokenId: string,
    user: RequestUser,
  ) {
    const map = await this.findOneRaw(mapId);
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
    return token as Record<string, unknown>;
  }

  // A move during a token's turn stays pending — the token sits on its new square, but the
  // distance isn't counted — until the DM confirms it here: the cost from the last confirmed
  // square (turn_anchor) to where it stands now joins turn_moved_ft. Several drags before a
  // confirm count as one straight move from the anchor, so a misplaced drop costs nothing.
  async confirmTokenMove(mapId: string, tokenId: string, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    const token = await this.findTurnToken(mapId, tokenId);
    const cost = moveCost(
      { x: Number(token.turn_anchor_x), y: Number(token.turn_anchor_y) },
      { x: Number(token.x), y: Number(token.y) },
      Number(token.turn_diagonals),
    );
    await this.db.execute(
      `UPDATE map_tokens SET turn_moved_ft = ?, turn_diagonals = ?,
         turn_anchor_x = x, turn_anchor_y = y
       WHERE id = ?`,
      [Number(token.turn_moved_ft) + cost.feet, cost.diagonals, tokenId],
    );
    const tokens = await this.getTokensRaw(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t) => t.id === tokenId);
  }

  // Throws away a pending move: the token goes back to its last confirmed square.
  async undoTokenMove(mapId: string, tokenId: string, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    await this.findTurnToken(mapId, tokenId);
    await this.db.execute(
      'UPDATE map_tokens SET x = turn_anchor_x, y = turn_anchor_y WHERE id = ?',
      [tokenId],
    );
    const tokens = await this.getTokensRaw(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t) => t.id === tokenId);
  }

  // The token, which must be taking its turn (only then does it have a confirmed anchor).
  private async findTurnToken(mapId: string, tokenId: string) {
    const result = await this.db.execute(
      'SELECT * FROM map_tokens WHERE id = ? AND map_id = ?',
      [tokenId, mapId],
    );
    const token = result.rows[0];
    if (!token) throw new NotFoundException('Token not found');
    if (token.turn_anchor_x == null || token.turn_anchor_y == null) {
      throw new BadRequestException("It isn't this token's turn");
    }
    return token;
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
    const tokens = await this.getTokensRaw(mapId);
    this.gateway.broadcastTokens(mapId, tokens);
    return tokens.find((t) => t.id === tokenId);
  }

  // `hidden_cells` empty means every cell is visible — a freshly-enabled map starts fully
  // revealed, and the DM paints/rect-selects areas to hide rather than areas to reveal.
  private async getFogRaw(mapId: string) {
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

  async getFog(mapId: string, user: RequestUser) {
    await this.resolveMapReadAccess(mapId, user);
    return this.getFogRaw(mapId);
  }

  async setFogEnabled(mapId: string, enabled: boolean, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    const fog = await this.getFogRaw(mapId);
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
    const fog = await this.getFogRaw(mapId);
    const cellSet = new Set(fog.hidden_cells);
    const keys = cells.map(({ col, row }) => `${col},${row}`);
    for (const key of keys) {
      if (revealed) cellSet.delete(key);
      else cellSet.add(key);
    }
    const hiddenCells = [...cellSet];
    await this.upsertFog(mapId, fog.enabled, hiddenCells);
    // Only the touched cells go over the socket — a brush stroke flushes every ~50ms, and
    // re-sending the whole hidden list each time grows with the size of the fogged area.
    this.gateway.broadcastFogCells(mapId, keys, revealed);
    return { enabled: fog.enabled, hidden_cells: hiddenCells };
  }

  // "Reset" now means "back to the fully-visible default" — clears whatever's been hidden.
  async resetFog(mapId: string, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    const fog = await this.getFogRaw(mapId);
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
    const fog = await this.getFogRaw(mapId);
    this.gateway.broadcastFog(mapId, fog);
    return fog;
  }

  // Dynamic lighting/darkness — independent of fog of war. `map_lighting.enabled` is the
  // per-map lit/dark toggle; `map_lights` holds DM-placed torches, each either standalone
  // (x/y set, token_id null) or attached to a token (token_id set, x/y left null — the light's
  // live position is derived from the token on the frontend, never persisted here).
  private async getLightingRaw(mapId: string) {
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
      walls: this.parseWalls(lightingResult.rows[0]?.walls),
      ambient_level: Number(lightingResult.rows[0]?.ambient_level ?? 0),
      ambient_color:
        (lightingResult.rows[0]?.ambient_color as string) ?? '#0a0a14',
    };
  }

  async getLighting(mapId: string, user: RequestUser) {
    const access = await this.resolveMapReadAccess(mapId, user);
    const lighting = await this.getLightingRaw(mapId);
    if (access.isDm) return lighting;
    const visibleTokenIds = new Set(
      serializePlayerTokens(await this.getTokensRaw(mapId)).map(
        (token) => token.id,
      ),
    );
    return {
      enabled: lighting.enabled,
      lights: lighting.lights
        .filter(
          (light) => !light.token_id || visibleTokenIds.has(light.token_id),
        )
        .map((light) => ({ ...light, label: '' })),
      // Players need the walls too — their own browser clips each light (and their darkvision)
      // against them. Walls are geometry only; nothing about them is DM-secret.
      walls: lighting.walls,
      // Ambient mood lighting is visual, not DM-secret information — players see the same
      // brightness/tint the DM set.
      ambient_level: lighting.ambient_level,
      ambient_color: lighting.ambient_color,
    };
  }

  async setLightingEnabled(mapId: string, enabled: boolean, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    await this.upsertMapLighting(mapId, enabled);
    return this.broadcastLighting(mapId);
  }

  // Map-wide brightness (0-100) and tint applied by the darkness overlay outside any torch's
  // reach — independent of the per-light color editor (light-editor-panel.ts), which only tints
  // what a specific torch casts.
  async setAmbientLight(
    mapId: string,
    level: number,
    color: string,
    user: RequestUser,
  ) {
    await this.assertMapAccess(mapId, user);
    if (!Number.isFinite(level) || level < 0 || level > 100)
      throw new BadRequestException('ambient level must be between 0 and 100');
    if (!/^#[0-9a-f]{6}$/i.test(color))
      throw new BadRequestException('ambient color must be a hex color');
    await this.db.execute(
      `INSERT INTO map_lighting (map_id, enabled, ambient_level, ambient_color) VALUES (?,0,?,?)
       ON CONFLICT(map_id) DO UPDATE SET
         ambient_level=excluded.ambient_level, ambient_color=excluded.ambient_color`,
      [mapId, Math.round(level), color],
    );
    return this.broadcastLighting(mapId);
  }

  // Replaces the map's whole wall set — the wall tool sends every add/erase as the full list,
  // same as a .dd2vtt import does. Each segment is validated and rounded so a malformed client
  // payload can't persist NaNs or a multi-megabyte blob.
  async setWalls(mapId: string, walls: unknown, user: RequestUser) {
    await this.assertMapAccess(mapId, user);
    if (!Array.isArray(walls))
      throw new BadRequestException('walls must be an array');
    if (walls.length > MAX_WALLS)
      throw new BadRequestException(
        `A map can have at most ${MAX_WALLS} walls`,
      );
    const clean = walls.map((wall) => {
      const w = (wall ?? {}) as Record<string, unknown>;
      const coords = [w.x1, w.y1, w.x2, w.y2].map(Number);
      if (!coords.every((n) => Number.isFinite(n)))
        throw new BadRequestException('Each wall needs numeric x1, y1, x2, y2');
      const [x1, y1, x2, y2] = coords.map((n) => Math.round(n * 1000) / 1000);
      return { x1, y1, x2, y2 };
    });
    await this.db.execute(
      `INSERT INTO map_lighting (map_id, enabled, walls) VALUES (?,0,?)
       ON CONFLICT(map_id) DO UPDATE SET walls=excluded.walls`,
      [mapId, JSON.stringify(clean)],
    );
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

  private parseWalls(raw: unknown): MapWall[] {
    if (typeof raw !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as MapWall[]) : [];
    } catch {
      return [];
    }
  }

  private async upsertMapLighting(mapId: string, enabled: boolean) {
    await this.db.execute(
      `INSERT INTO map_lighting (map_id, enabled) VALUES (?,?)
       ON CONFLICT(map_id) DO UPDATE SET enabled=excluded.enabled`,
      [mapId, enabled ? 1 : 0],
    );
  }

  private async broadcastLighting(mapId: string) {
    const lighting = await this.getLightingRaw(mapId);
    void this.gateway.broadcastLighting(mapId, lighting);
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
    const map = await this.findOneRaw(mapId);
    await this.assertCampaignAccess(map.campaign_id as string, user);
    return map;
  }

  async getPlayerState(mapId: string, user: RequestUser) {
    const access = await this.resolveMapReadAccess(mapId, user);
    const [tokens, fog, lighting] = await Promise.all([
      this.getTokensRaw(mapId),
      this.getFogRaw(mapId),
      this.getLightingRaw(mapId),
    ]);
    if (access.isDm) {
      return {
        map: this.serializeMap(access.map, true),
        tokens,
        fog,
        lighting,
      };
    }
    const playerTokens = serializePlayerTokens(tokens);
    const visibleIds = new Set(playerTokens.map((token) => token.id));
    return {
      map: this.serializeMap(access.map, false),
      tokens: playerTokens,
      fog,
      lighting: {
        enabled: lighting.enabled,
        lights: lighting.lights
          .filter((light) => !light.token_id || visibleIds.has(light.token_id))
          .map((light) => ({ ...light, label: '' })),
      },
    };
  }

  async getImageFile(mapId: string, user: RequestUser) {
    const access = await this.resolveMapReadAccess(mapId, user);
    return this.resolveImagePath(access.map.image_url as string);
  }

  private serializeMap(map: Record<string, unknown>, isDm: boolean) {
    const common = {
      id: map.id,
      campaign_id: map.campaign_id,
      name: map.name,
      grid_size: Number(map.grid_size ?? 50),
      visibility_revision: Number(map.visibility_revision ?? 0),
      image_url: `/api/maps/${String(map.id)}/image`,
      created_at: map.created_at,
    };
    return isDm ? { ...map, ...common } : common;
  }

  private async resolveMapReadAccess(mapId: string, user: RequestUser) {
    const map = await this.findOneRaw(mapId);
    const campaignId = map.campaign_id as string;
    if (await this.isCampaignDm(campaignId, user)) {
      return { map, isDm: true };
    }
    const membership = await this.db.execute(
      `SELECT id FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [campaignId, user.id],
    );
    if (!membership.rows[0]) throw new ForbiddenException();
    const visibleReference = await this.db.execute(
      `SELECT e.id FROM encounters e
       JOIN encounter_levels el ON el.encounter_id = e.id
       JOIN sessions s ON s.id = e.session_id
       WHERE el.map_id = ? AND s.campaign_id = ?
         AND s.visible_to_players = 1 AND e.visible_to_players = 1
       LIMIT 1`,
      [mapId, campaignId],
    );
    if (!visibleReference.rows[0]) throw new ForbiddenException();
    return { map, isDm: false };
  }

  private resolveImagePath(imageUrl: string): string {
    const relative = imageUrl.replace(/^\/+/, '');
    if (!relative.startsWith('uploads/maps/')) {
      throw new NotFoundException('Map image not found');
    }
    const uploadsRoot = resolve(process.cwd(), 'uploads', 'maps');
    const target = resolve(process.cwd(), relative);
    if (!target.startsWith(`${uploadsRoot}${sep}`) || !existsSync(target)) {
      throw new NotFoundException('Map image not found');
    }
    return target;
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
