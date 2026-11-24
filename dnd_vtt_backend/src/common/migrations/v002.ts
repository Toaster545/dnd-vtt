import { Migration } from './migration';

// ── V2: characters → data blob ───────────────────────────────────────────────
export const migrateV2: Migration = {
  version: 2,
  async up(ctx) {
    // Migrate existing rows into the new blob format, then swap tables
    await ctx.db.execute(`ALTER TABLE characters RENAME TO characters_v1`);

    await ctx.db.execute(`
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
    await ctx.db.execute(`
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

    await ctx.db.execute(`DROP TABLE characters_v1`);
    await ctx.db.execute(`PRAGMA user_version = 2`);
    ctx.logger.log('Applied schema migration v2 (characters → data blob)');
  },
};
