import { Migration } from './migration';

// ── V5: encounter join codes ──────────────────────────────────────────────────
export const migrateV5: Migration = {
  version: 5,
  async up(ctx) {
    await ctx.db.execute(`ALTER TABLE encounters ADD COLUMN join_code TEXT`);

    await ctx.db.execute(`PRAGMA user_version = 5`);
    ctx.logger.log('Applied schema migration v5 (encounter join codes)');
  },
};
