import { Migration } from './migration';

// ── V29: per-turn movement tracking ───────────────────────────────────────────
// Where a token stood when its turn began (null when it isn't its turn) and how far it has
// moved since, so the battle map can show its starting square and the distance traveled.
// turn_diagonals carries the PHB 5/10/5 diagonal count across separate moves within the turn.
export const migrateV29: Migration = {
  version: 29,
  async up(ctx) {
    for (const column of [
      'turn_start_x REAL',
      'turn_start_y REAL',
      'turn_moved_ft INTEGER NOT NULL DEFAULT 0',
      'turn_diagonals INTEGER NOT NULL DEFAULT 0',
    ]) {
      await ctx.db.execute(`ALTER TABLE map_tokens ADD COLUMN ${column}`);
    }
    await ctx.db.execute(`PRAGMA user_version = 29`);
    ctx.logger.log('Applied schema migration v29 (per-turn token movement)');
  },
};
