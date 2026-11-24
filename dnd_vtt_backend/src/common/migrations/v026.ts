import { Migration } from './migration';

// ── V26: light-blocking walls ───────────────────────────────────────────────
// DM-drawn wall segments that stop light (and darkvision) from spilling through. Stored as one
// JSON array per map on map_lighting rather than a row per segment: walls are always loaded,
// broadcast and replaced as a whole set (a DM draws/erases a batch at a time, and a .dd2vtt
// import brings hundreds at once), never queried individually. Each entry is
// { x1, y1, x2, y2 } in fractional grid units, the same space standalone lights use.
export const migrateV26: Migration = {
  version: 26,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE map_lighting ADD COLUMN walls TEXT NOT NULL DEFAULT '[]'`,
    );
    await ctx.db.execute(`PRAGMA user_version = 26`);
    ctx.logger.log('Applied schema migration v26 (light-blocking walls)');
  },
};
