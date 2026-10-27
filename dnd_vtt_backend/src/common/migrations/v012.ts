import { Migration } from './migration';

// ── V12: fog of war ───────────────────────────────────────────────────────
export const migrateV12: Migration = {
  version: 12,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS map_fog (
        map_id         TEXT PRIMARY KEY REFERENCES battle_maps(id) ON DELETE CASCADE,
        enabled        INTEGER NOT NULL DEFAULT 0,
        revealed_cells TEXT NOT NULL DEFAULT '[]'
      )
    `);

    await ctx.db.execute(`PRAGMA user_version = 12`);
    ctx.logger.log('Applied schema migration v12 (fog of war)');
  },
};
