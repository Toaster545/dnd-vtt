import { Migration } from './migration';

// ── V4: map_tokens reference their source (character or monster type) ───────
export const migrateV4: Migration = {
  version: 4,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN character_id TEXT REFERENCES characters(id) ON DELETE SET NULL`,
    );
    await ctx.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN monster_index TEXT`,
    );

    await ctx.db.execute(`PRAGMA user_version = 4`);
    ctx.logger.log(
      'Applied schema migration v4 (map_tokens source references)',
    );
  },
};
