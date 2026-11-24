import { Migration } from './migration';

// ── V32: named encounter levels ─────────────────────────────────────────────
// A per-encounter label for each level ("Crypt", "Upper Floor"). NULL keeps showing the map's
// own name — renaming the level never renames the map, which other encounters may share.
export const migrateV32: Migration = {
  version: 32,
  async up(ctx) {
    await ctx.db.execute(`ALTER TABLE encounter_levels ADD COLUMN name TEXT`);
    await ctx.db.execute(`PRAGMA user_version = 32`);
    ctx.logger.log('Applied schema migration v32 (named encounter levels)');
  },
};
