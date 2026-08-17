import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createClient, Client, ResultSet } from '@libsql/client';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { generateJoinCode } from './join-code.util';

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
      statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    );
  }

  close() {
    this.db?.close();
  }

  parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private async runMigrations() {
    await this.db.execute(`PRAGMA foreign_keys = ON`);

    // Determine current schema version
    let version = Number(
      (await this.db.execute(`PRAGMA user_version`)).rows[0]?.user_version ?? 0,
    );

    // Tables exist but predate versioning → treat as v1
    if (version === 0) {
      const info = await this.db.execute(`PRAGMA table_info(profiles)`);
      if (info.rows.length > 0) version = 1;
    }

    if (version < 1) await this.applyV1();
    if (version < 2) await this.applyV2();
    if (version < 3) await this.applyV3();
    if (version < 4) await this.applyV4();
    if (version < 5) await this.applyV5();
    if (version < 6) await this.applyV6();
    if (version < 7) await this.applyV7();
    if (version < 8) await this.applyV8();
    if (version < 9) await this.applyV9();
    if (version < 10) await this.applyV10();
    if (version < 11) await this.applyV11();
    if (version < 12) await this.applyV12();
    if (version < 13) await this.applyV13();
    if (version < 14) await this.applyV14();
    if (version < 15) await this.applyV15();
    if (version < 16) await this.applyV16();
    if (version < 17) await this.applyV17();
    if (version < 18) await this.applyV18();
    if (version < 19) await this.applyV19();
    if (version < 20) await this.applyV20();
    if (version < 21) await this.applyV21();
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

  // ── V3: encounters ───────────────────────────────────────────────────────────
  private async applyV3() {
    await this.db.execute(`
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

    await this.db.execute(`PRAGMA user_version = 3`);
    this.logger.log('Applied schema migration v3 (encounters)');
  }

  // ── V4: map_tokens reference their source (character or monster type) ───────
  private async applyV4() {
    await this.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN character_id TEXT REFERENCES characters(id) ON DELETE SET NULL`,
    );
    await this.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN monster_index TEXT`,
    );

    await this.db.execute(`PRAGMA user_version = 4`);
    this.logger.log(
      'Applied schema migration v4 (map_tokens source references)',
    );
  }

  // ── V5: encounter join codes ──────────────────────────────────────────────────
  private async applyV5() {
    await this.db.execute(`ALTER TABLE encounters ADD COLUMN join_code TEXT`);

    await this.db.execute(`PRAGMA user_version = 5`);
    this.logger.log('Applied schema migration v5 (encounter join codes)');
  }

  // ── V6: token initiative (turn order) ────────────────────────────────────────
  private async applyV6() {
    await this.db.execute(`ALTER TABLE map_tokens ADD COLUMN initiative REAL`);

    await this.db.execute(`PRAGMA user_version = 6`);
    this.logger.log('Applied schema migration v6 (token initiative)');
  }

  // ── V7: campaigns ─────────────────────────────────────────────────────────────
  private async applyV7() {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id          TEXT PRIMARY KEY,
        dm_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        join_code   TEXT NOT NULL UNIQUE,
        data        TEXT NOT NULL DEFAULT '{}',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS campaign_members (
        id                  TEXT PRIMARY KEY,
        campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id             TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        character_id        TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        source_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
        status              TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','removed')),
        joined_at           TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // One active membership per player per campaign; removed rows stick around for history.
    await this.db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_members_active
      ON campaign_members(campaign_id, user_id) WHERE status = 'active'
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id          TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('campaign','session','encounter')),
        entity_id   TEXT NOT NULL,
        author_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        visibility  TEXT NOT NULL DEFAULT 'shared' CHECK(visibility IN ('shared','dm_only')),
        content     TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(entity_type, entity_id)
    `);

    await this.db.execute(
      `ALTER TABLE sessions ADD COLUMN campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE`,
    );
    await this.db.execute(
      `ALTER TABLE sessions ADD COLUMN visible_to_players INTEGER NOT NULL DEFAULT 0`,
    );
    await this.db.execute(
      `ALTER TABLE characters ADD COLUMN campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL`,
    );
    await this.db.execute(
      `ALTER TABLE encounters ADD COLUMN visible_to_players INTEGER NOT NULL DEFAULT 0`,
    );
    await this.db.execute(
      `ALTER TABLE encounters ADD COLUMN summary TEXT NOT NULL DEFAULT ''`,
    );

    // Backfill: every DM who already has sessions gets a "Legacy Campaign" so their existing
    // sessions (and, transitively, encounters) aren't orphaned by the new required campaign_id.
    const dms = await this.db.execute(
      `SELECT DISTINCT dm_id FROM sessions WHERE dm_id IS NOT NULL`,
    );
    for (const row of dms.rows) {
      const dmId = row.dm_id as string;
      const campaignId = randomUUID();
      let joinCode: string;
      do {
        joinCode = generateJoinCode();
      } while (
        (
          await this.db.execute(
            `SELECT id FROM campaigns WHERE join_code = ?`,
            [joinCode],
          )
        ).rows.length > 0
      );

      await this.db.execute(
        `INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, 'Legacy Campaign', ?)`,
        [campaignId, dmId, joinCode],
      );
      await this.db.execute(
        `UPDATE sessions SET campaign_id = ? WHERE dm_id = ?`,
        [campaignId, dmId],
      );
    }

    await this.db.execute(`PRAGMA user_version = 7`);
    this.logger.log('Applied schema migration v7 (campaigns)');
  }

  // ── V8: relative map image URLs ──────────────────────────────────────────────
  // Uploaded map images used to be stored with a baked-in absolute host (defaulting to
  // http://localhost:3000). That's wrong for anything accessed through a different host — e.g. a
  // Cloudflare Tunnel domain — and outright breaks under https (mixed-content blocking). Strip any
  // existing `scheme://host[:port]` prefix down to the relative `/uploads/...` path, which resolves
  // correctly against whatever origin actually served the page. See MapsService.uploadImage.
  private async applyV8() {
    const rows = await this.db.execute(
      `SELECT id, image_url FROM battle_maps WHERE image_url LIKE 'http://%' OR image_url LIKE 'https://%'`,
    );
    for (const row of rows.rows) {
      const url = row.image_url as string;
      const relative = url.replace(/^https?:\/\/[^/]+/, '');
      await this.db.execute(
        `UPDATE battle_maps SET image_url = ? WHERE id = ?`,
        [relative, row.id],
      );
    }

    await this.db.execute(`PRAGMA user_version = 8`);
    this.logger.log(
      `Applied schema migration v8 (relative map image URLs, fixed ${rows.rows.length} row(s))`,
    );
  }

  // ── V9: campaign/session background images ──────────────────────────────────
  private async applyV9() {
    await this.db.execute(
      `ALTER TABLE campaigns ADD COLUMN background_url TEXT`,
    );
    await this.db.execute(
      `ALTER TABLE sessions ADD COLUMN background_url TEXT`,
    );

    await this.db.execute(`PRAGMA user_version = 9`);
    this.logger.log(
      'Applied schema migration v9 (campaign/session backgrounds)',
    );
  }

  // ── V10: encounter turn tracking ─────────────────────────────────────────────
  private async applyV10() {
    await this.db.execute(
      `ALTER TABLE encounters ADD COLUMN current_turn_token_id TEXT REFERENCES map_tokens(id) ON DELETE SET NULL`,
    );
    await this.db.execute(
      `ALTER TABLE encounters ADD COLUMN round_number INTEGER NOT NULL DEFAULT 1`,
    );

    await this.db.execute(`PRAGMA user_version = 10`);
    this.logger.log('Applied schema migration v10 (encounter turn tracking)');
  }

  // ── V11: DM-grantable full edit access to a player's campaign character copy ────
  private async applyV11() {
    await this.db.execute(
      `ALTER TABLE campaign_members ADD COLUMN edit_unlocked INTEGER NOT NULL DEFAULT 0`,
    );

    await this.db.execute(`PRAGMA user_version = 11`);
    this.logger.log(
      'Applied schema migration v11 (campaign member edit access)',
    );
  }

  // ── V12: fog of war ───────────────────────────────────────────────────────
  private async applyV12() {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS map_fog (
        map_id         TEXT PRIMARY KEY REFERENCES battle_maps(id) ON DELETE CASCADE,
        enabled        INTEGER NOT NULL DEFAULT 0,
        revealed_cells TEXT NOT NULL DEFAULT '[]'
      )
    `);

    await this.db.execute(`PRAGMA user_version = 12`);
    this.logger.log('Applied schema migration v12 (fog of war)');
  }

  // ── V13: fog of war starts fully visible — a map defaults to nothing hidden, the DM paints
  // areas to hide rather than areas to reveal, so the stored set flips from "what's revealed" to
  // "what's hidden" (an empty set now means "everything visible" instead of "everything hidden").
  private async applyV13() {
    await this.db.execute(
      `ALTER TABLE map_fog RENAME COLUMN revealed_cells TO hidden_cells`,
    );

    await this.db.execute(`PRAGMA user_version = 13`);
    this.logger.log('Applied schema migration v13 (fog defaults to visible)');
  }

  // ── V14: player-controlled race/class visibility in the campaign roster — hidden from the rest
  // of the party by default, the DM always sees it regardless (see CampaignsService.deserializeMember).
  private async applyV14() {
    await this.db.execute(
      `ALTER TABLE campaign_members ADD COLUMN show_race_class INTEGER NOT NULL DEFAULT 0`,
    );

    await this.db.execute(`PRAGMA user_version = 14`);
    this.logger.log(
      'Applied schema migration v14 (campaign member race/class visibility)',
    );
  }

  // ── V15: DM-controlled per-member party list visibility — hidden from the rest of the party
  // by default (the DM opts each member in), but always visible to the DM and to the member
  // themselves (see CampaignsService.deserializeMember / findOne's post-query filter).
  private async applyV15() {
    await this.db.execute(
      `ALTER TABLE campaign_members ADD COLUMN visible_to_party INTEGER NOT NULL DEFAULT 0`,
    );

    await this.db.execute(`PRAGMA user_version = 15`);
    this.logger.log(
      'Applied schema migration v15 (campaign member party visibility)',
    );
  }

  // ── V16: per-user "last visited" tracking for campaigns, so the campaign list can be ordered
  // by recency of use rather than just creation date — one row per (campaign, user), upserted
  // every time that user successfully loads the campaign hub (see CampaignsService.findOne).
  private async applyV16() {
    await this.db.execute(`
      CREATE TABLE campaign_visits (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        visited_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, user_id)
      )
    `);

    await this.db.execute(`PRAGMA user_version = 16`);
    this.logger.log(
      'Applied schema migration v16 (campaign last-visited tracking)',
    );
  }

  // ── V17: DM-authored custom content (monsters, items, spells), one library per creating
  // user, reusable across every campaign they DM. `data` holds the full content-shape payload
  // (same shape as the static SRD JSON files), with `data.index` always `custom:<id>`.
  private async applyV17() {
    const createTable = (name: string) => `
      CREATE TABLE ${name} (
        id TEXT PRIMARY KEY,
        created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `;

    await this.db.execute(createTable('custom_monsters'));
    await this.db.execute(
      `CREATE INDEX idx_custom_monsters_created_by ON custom_monsters(created_by)`,
    );

    await this.db.execute(createTable('custom_items'));
    await this.db.execute(
      `CREATE INDEX idx_custom_items_created_by ON custom_items(created_by)`,
    );

    await this.db.execute(createTable('custom_spells'));
    await this.db.execute(
      `CREATE INDEX idx_custom_spells_created_by ON custom_spells(created_by)`,
    );

    await this.db.execute(`PRAGMA user_version = 17`);
    this.logger.log(
      'Applied schema migration v17 (custom monsters/items/spells libraries)',
    );
  }

  // ── V18: dynamic lighting/darkness — a per-map lit/dark toggle (map_lighting, mirrors
  // map_fog's shape) plus DM-placed light sources (map_lights) that are either standalone
  // (fixed x/y) or attached to a token (token_id set, x/y left null — the light's position is
  // derived live from the token's current position at render time, never persisted, so it can't
  // go stale as the token moves). Independent of fog of war; a light attached to a token is
  // deleted along with it (ON DELETE CASCADE).
  private async applyV18() {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS map_lighting (
        map_id  TEXT PRIMARY KEY REFERENCES battle_maps(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 0
      )
    `);
    await this.db.execute(`
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
    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_map_lights_map_id ON map_lights(map_id)`,
    );
    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_map_lights_token_id ON map_lights(token_id)`,
    );

    await this.db.execute(`PRAGMA user_version = 18`);
    this.logger.log(
      'Applied schema migration v18 (dynamic lighting / darkness)',
    );
  }

  // ── V19: explicit character-enabled and campaign-allowed content sources ────────────────
  // Both entities already use extensible JSON data blobs. Persisting the choices there keeps
  // source policy close to the character/campaign without adding one column per future book.
  // Existing Artificers are opted into Eberron so the migration never makes a saved character
  // internally inconsistent; every other existing character and campaign defaults to PHB only.
  private async applyV19() {
    await this.db.execute(`
      UPDATE characters
      SET data = json_set(
        CASE WHEN json_valid(data) THEN data ELSE '{}' END,
        '$.enabled_sources',
        CASE
          WHEN lower(class) = 'artificer' THEN json('["XPHB","EFA"]')
          ELSE json('["XPHB"]')
        END
      )
      WHERE json_type(data, '$.enabled_sources') IS NULL
    `);
    await this.db.execute(`
      UPDATE campaigns
      SET data = json_set(
        CASE WHEN json_valid(data) THEN data ELSE '{}' END,
        '$.allowed_sources',
        json('["XPHB"]')
      )
      WHERE json_type(data, '$.allowed_sources') IS NULL
    `);

    await this.db.execute(`PRAGMA user_version = 19`);
    this.logger.log(
      'Applied schema migration v19 (character and campaign content sources)',
    );
  }

  // ── V20: provider-owned spell access ──────────────────────────────────────
  // Spell records now describe only the spell itself. Classes, subclasses, species,
  // backgrounds, feats, and class features own their spell-list/grant relationships, and the
  // API derives reverse access metadata from those providers. Strip the obsolete reverse fields
  // from existing homebrew spell JSON so static and database-backed spells use the same shape.
  private async applyV20() {
    await this.db.execute(`
      UPDATE custom_spells
      SET data = json_remove(
        data,
        '$.classes',
        '$.subclasses',
        '$.species',
        '$.backgrounds',
        '$.feats',
        '$.other_options'
      )
      WHERE json_valid(data)
    `);
    await this.db.execute(`PRAGMA user_version = 20`);
    this.logger.log(
      'Applied schema migration v20 (provider-owned spell access)',
    );
  }

  // ── V21: mobile player context, secure sessions, drafts, and visibility ───────────────
  private async applyV21() {
    await this.db.execute(
      `ALTER TABLE campaigns ADD COLUMN current_session_id TEXT`,
    );
    await this.db.execute(
      `ALTER TABLE battle_maps ADD COLUMN visibility_revision INTEGER NOT NULL DEFAULT 0`,
    );
    await this.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN visible_to_players INTEGER NOT NULL DEFAULT 1`,
    );
    await this.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN name_visible_to_players INTEGER NOT NULL DEFAULT 1`,
    );
    await this.db.execute(
      `ALTER TABLE characters ADD COLUMN creation_status TEXT NOT NULL DEFAULT 'complete' CHECK(creation_status IN ('draft','complete'))`,
    );
    await this.db.execute(
      `ALTER TABLE characters ADD COLUMN draft_step INTEGER NOT NULL DEFAULT 0`,
    );
    await this.db.execute(`
      CREATE TABLE auth_sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        client_type TEXT NOT NULL CHECK(client_type IN ('web','native')),
        expires_at  TEXT NOT NULL,
        revoked_at  TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT
      )
    `);
    await this.db.execute(
      `CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id)`,
    );
    await this.db.execute(
      `CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at)`,
    );
    await this.db.execute(`PRAGMA user_version = 21`);
    this.logger.log(
      'Applied schema migration v21 (mobile context, secure auth, drafts, visibility)',
    );
  }
}
