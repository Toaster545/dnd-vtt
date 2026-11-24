import { Migration } from './migration';

// ── V31: confirmed movement ───────────────────────────────────────────────────
// The token's last DM-confirmed square this turn. A move only counts toward turn_moved_ft once
// the DM confirms it; until then the token can be sent back here.
export const migrateV31: Migration = {
  version: 31,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN turn_anchor_x REAL`,
    );
    await ctx.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN turn_anchor_y REAL`,
    );
    // A turn already under way: its token's current square is the confirmed one.
    await ctx.db.execute(
      `UPDATE map_tokens SET turn_anchor_x = x, turn_anchor_y = y
       WHERE turn_start_x IS NOT NULL`,
    );
    await ctx.db.execute(`PRAGMA user_version = 31`);
    ctx.logger.log('Applied schema migration v31 (confirmed token movement)');
  },
};
