import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createClient, Client, ResultSet } from '@libsql/client';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private db: Client;

  async onModuleInit() {
    const dbPath = process.env.DB_PATH ?? './data/dnd.db';
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = createClient({ url: `file:${dbPath}` });
    await this.runMigrations();
    this.logger.log(`SQLite database ready at ${dbPath}`);
  }

  async execute(sql: string, args: any[] = []): Promise<ResultSet> {
    return this.db.execute({ sql, args });
  }

  async executeMany(statements: { sql: string; args?: any[] }[]) {
    return this.db.batch(
      statements.map(s => ({ sql: s.sql, args: s.args ?? [] })),
    );
  }

  parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }

  private async runMigrations() {
    await this.db.execute(`PRAGMA foreign_keys = ON`);

    // Determine current schema version
    let version = Number((await this.db.execute(`PRAGMA user_version`)).rows[0]?.user_version ?? 0);

    // Tables exist but predate versioning → treat as v1
    if (version === 0) {
      const info = await this.db.execute(`PRAGMA table_info(profiles)`);
      if (info.rows.length > 0) version = 1;
    }

    if (version < 1) await this.applyV1();
    if (version < 2) await this.applyV2();
  }

  // ── V1: initial schema (explicit columns on characters) ─────────────────────
  private async applyV1() {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('admin','player')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await this.db.execute(`
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

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS battle_maps (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL DEFAULT 'default',
        name        TEXT NOT NULL,
        image_url   TEXT NOT NULL,
        grid_size   INTEGER NOT NULL DEFAULT 50,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        dm_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await this.db.execute(`
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

    await this.db.execute(`PRAGMA user_version = 1`);
    this.logger.log('Applied schema migration v1');
  }

  // ── V2: characters → data blob ───────────────────────────────────────────────
  private async applyV2() {
    // Migrate existing rows into the new blob format, then swap tables
    await this.db.execute(`ALTER TABLE characters RENAME TO characters_v1`);

    await this.db.execute(`
      CREATE TABLE characters (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        race       TEXT NOT NULL DEFAULT '',
        class      TEXT NOT NULL DEFAULT '',
        level      INTEGER NOT NULL DEFAULT 1,
        data       TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Migrate existing characters; initialize new fields with sane defaults
    await this.db.execute(`
      INSERT INTO characters (id, user_id, name, race, class, level, data, created_at, updated_at)
      SELECT
        id, user_id, name, race, class, level,
        json_object(
          'subclass',          COALESCE(subclass, ''),
          'background',        COALESCE(background, ''),
          'alignment',         COALESCE(alignment, 'True Neutral'),
          'ability_scores',    json(COALESCE(ability_scores, '{}')),
          'max_hp',            COALESCE(max_hp, 10),
          'current_hp',        COALESCE(current_hp, 10),
          'temp_hp',           0,
          'hit_dice_used',     0,
          'death_saves',       json('{"successes":0,"failures":0}'),
          'conditions',        json('[]'),
          'armor_class',       COALESCE(armor_class, 10),
          'speed',             COALESCE(speed, 30),
          'skills',            json(COALESCE(skills, '{}')),
          'expertise',         json('{}'),
          'equipment',         json('[]'),
          'currency',          json('{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'),
          'spells',            json('[]'),
          'spell_slots_used',  json('{}'),
          'personality_traits','',
          'ideals',            '',
          'bonds',             '',
          'flaws',             '',
          'notes',             COALESCE(notes, ''),
          'avatar_url',        avatar_url
        ),
        created_at, updated_at
      FROM characters_v1
    `);

    await this.db.execute(`DROP TABLE characters_v1`);
    await this.db.execute(`PRAGMA user_version = 2`);
    this.logger.log('Applied schema migration v2 (characters → data blob)');
  }
}
