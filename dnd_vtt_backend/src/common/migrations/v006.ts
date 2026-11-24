import { Migration } from './migration';

// ── V6: token initiative (turn order) ────────────────────────────────────────
export const migrateV6: Migration = {
  version: 6,
  async up(ctx) {
    await ctx.db.execute(`ALTER TABLE map_tokens ADD COLUMN initiative REAL`);

    await ctx.db.execute(`PRAGMA user_version = 6`);
    ctx.logger.log('Applied schema migration v6 (token initiative)');
  },
};
