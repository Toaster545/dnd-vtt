import { Migration } from './migration';

// ── V25: per-DM image overrides for official SRD items ──────────────────────
// SRD items are static JSON files, not DB rows, so a DM can't just edit one like a homebrew
// item — this table lets them swap in a different image without forking the item into their
// own custom-content library. Keyed by (item_index, created_by) rather than item_index alone
// because each DM's library (and therefore their view of the SRD set) is independent, matching
// how custom_items is already scoped per-created_by rather than shared globally.
export const migrateV25: Migration = {
  version: 25,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE item_image_overrides (
        item_index TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        image_url  TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (item_index, created_by)
      )
    `);
    await ctx.db.execute(`PRAGMA user_version = 25`);
    ctx.logger.log('Applied schema migration v25 (item image overrides)');
  },
};
