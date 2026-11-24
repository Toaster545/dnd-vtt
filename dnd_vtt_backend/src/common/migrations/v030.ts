import { Migration } from './migration';

// ── V30: player-planned destinations ──────────────────────────────────────────
// The square a player would like their token moved to. Set by the player at any time, only
// surfaced to the DM on that token's turn, and cleared once the turn ends.
export const migrateV30: Migration = {
  version: 30,
  async up(ctx) {
    await ctx.db.execute(`ALTER TABLE map_tokens ADD COLUMN planned_x REAL`);
    await ctx.db.execute(`ALTER TABLE map_tokens ADD COLUMN planned_y REAL`);
    await ctx.db.execute(`PRAGMA user_version = 30`);
    ctx.logger.log('Applied schema migration v30 (planned token destinations)');
  },
};
