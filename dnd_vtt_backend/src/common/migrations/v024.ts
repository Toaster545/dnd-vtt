import { Migration } from './migration';

// ── V24: drop the notes/comments feature ─────────────────────────────────────
// The campaign/session hubs replaced their "Comments" panels with an embedded wiki view, and
// the encounter notes panels went with them. Nothing reads the `notes` table any more.
export const migrateV24: Migration = {
  version: 24,
  async up(ctx) {
    await ctx.db.execute(`DROP INDEX IF EXISTS idx_notes_entity`);
    await ctx.db.execute(`DROP TABLE IF EXISTS notes`);
    await ctx.db.execute(`PRAGMA user_version = 24`);
    ctx.logger.log('Applied schema migration v24 (drop notes)');
  },
};
