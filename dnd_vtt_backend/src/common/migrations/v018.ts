import { Migration } from './migration';

// ── V18: dynamic lighting/darkness — a per-map lit/dark toggle (map_lighting, mirrors
// map_fog's shape) plus DM-placed light sources (map_lights) that are either standalone
// (fixed x/y) or attached to a token (token_id set, x/y left null — the light's position is
// derived live from the token's current position at render time, never persisted, so it can't
// go stale as the token moves). Independent of fog of war; a light attached to a token is
// deleted along with it (ON DELETE CASCADE).
export const migrateV18: Migration = {
  version: 18,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS map_lighting (
        map_id  TEXT PRIMARY KEY REFERENCES battle_maps(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 0
      )
    `);
    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS map_lights (
        id                TEXT PRIMARY KEY,
        map_id            TEXT NOT NULL REFERENCES battle_maps(id) ON DELETE CASCADE,
        token_id          TEXT REFERENCES map_tokens(id) ON DELETE CASCADE,
        x                 REAL,
        y                 REAL,
        bright_radius_ft  INTEGER NOT NULL DEFAULT 20,
        dim_radius_ft     INTEGER NOT NULL DEFAULT 20,
        color             TEXT NOT NULL DEFAULT '#ffa542',
        enabled           INTEGER NOT NULL DEFAULT 1,
        label             TEXT NOT NULL DEFAULT 'Torch',
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await ctx.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_map_lights_map_id ON map_lights(map_id)`,
    );
    await ctx.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_map_lights_token_id ON map_lights(token_id)`,
    );

    await ctx.db.execute(`PRAGMA user_version = 18`);
    ctx.logger.log(
      'Applied schema migration v18 (dynamic lighting / darkness)',
    );
  },
};
