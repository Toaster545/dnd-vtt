import { Migration } from './migration';

// ── V10: encounter turn tracking ─────────────────────────────────────────────
export const migrateV10: Migration = {
  version: 10,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE encounters ADD COLUMN current_turn_token_id TEXT REFERENCES map_tokens(id) ON DELETE SET NULL`,
    );
    await ctx.db.execute(
      `ALTER TABLE encounters ADD COLUMN round_number INTEGER NOT NULL DEFAULT 1`,
    );

    await ctx.db.execute(`PRAGMA user_version = 10`);
    ctx.logger.log('Applied schema migration v10 (encounter turn tracking)');
  },
};
