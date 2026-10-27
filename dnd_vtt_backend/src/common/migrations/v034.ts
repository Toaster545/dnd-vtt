import { Migration } from './migration';

export const migrateV34: Migration = {
  version: 34,
  async up(ctx) {
    await ctx.db.execute(`CREATE TABLE companions (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(character_id,kind))`);
    await ctx.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN companion_id TEXT REFERENCES companions(id) ON DELETE CASCADE`,
    );
    await ctx.db.execute(
      `CREATE INDEX map_tokens_companion ON map_tokens(companion_id)`,
    );
    await ctx.db.execute(`CREATE TABLE companion_turns (
      encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      companion_id TEXT NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(encounter_id,companion_id))`);
    await ctx.db.execute(`PRAGMA user_version = 34`);
  },
};
