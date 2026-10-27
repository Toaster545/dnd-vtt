import { Migration } from './migration';

// ── V1: initial schema (explicit columns on characters) ─────────────────────
export const migrateV1: Migration = {
  version: 1,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('admin','player')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS characters (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name              TEXT NOT NULL,
        race              TEXT NOT NULL DEFAULT '',
        class             TEXT NOT NULL DEFAULT '',
        subclass          TEXT DEFAULT '',
        level             INTEGER NOT NULL DEFAULT 1,
        background        TEXT NOT NULL DEFAULT '',
        alignment         TEXT NOT NULL DEFAULT 'True Neutral',
        ability_scores    TEXT NOT NULL DEFAULT '{}',
        max_hp            INTEGER NOT NULL DEFAULT 10,
        current_hp        INTEGER NOT NULL DEFAULT 10,
        armor_class       INTEGER NOT NULL DEFAULT 10,
        speed             INTEGER NOT NULL DEFAULT 30,
        proficiency_bonus INTEGER NOT NULL DEFAULT 2,
        skills            TEXT NOT NULL DEFAULT '{}',
        equipment         TEXT NOT NULL DEFAULT '[]',
        spells            TEXT NOT NULL DEFAULT '[]',
        notes             TEXT DEFAULT '',
        avatar_url        TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS battle_maps (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL DEFAULT 'default',
        name        TEXT NOT NULL,
        image_url   TEXT NOT NULL,
        grid_size   INTEGER NOT NULL DEFAULT 50,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        dm_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS map_tokens (
        id        TEXT PRIMARY KEY,
        map_id    TEXT NOT NULL REFERENCES battle_maps(id) ON DELETE CASCADE,
        label     TEXT NOT NULL,
        color     TEXT NOT NULL DEFAULT '#e74c3c',
        x         INTEGER NOT NULL DEFAULT 0,
        y         INTEGER NOT NULL DEFAULT 0,
        size      INTEGER NOT NULL DEFAULT 1,
        hp        INTEGER,
        max_hp    INTEGER,
        is_player INTEGER NOT NULL DEFAULT 0
      )
    `);

    await ctx.db.execute(`PRAGMA user_version = 1`);
    ctx.logger.log('Applied schema migration v1');
  },
};
