import { Migration } from './migration';

// ── V3: encounters ───────────────────────────────────────────────────────────
export const migrateV3: Migration = {
  version: 3,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS encounters (
        id            TEXT PRIMARY KEY,
        dm_id         TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        session_id    TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        name          TEXT NOT NULL,
        map_id        TEXT REFERENCES battle_maps(id) ON DELETE SET NULL,
        monsters      TEXT NOT NULL DEFAULT '[]',
        character_ids TEXT NOT NULL DEFAULT '[]',
        status        TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','ended')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await ctx.db.execute(`PRAGMA user_version = 3`);
    ctx.logger.log('Applied schema migration v3 (encounters)');
  },
};
