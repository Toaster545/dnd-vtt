import { Migration } from './migration';

// ── V17: DM-authored custom content (monsters, items, spells), one library per creating
// user, reusable across every campaign they DM. `data` holds the full content-shape payload
// (same shape as the static SRD JSON files), with `data.index` always `custom:<id>`.
export const migrateV17: Migration = {
  version: 17,
  async up(ctx) {
    const createTable = (name: string) => `
      CREATE TABLE ${name} (
        id TEXT PRIMARY KEY,
        created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `;

    await ctx.db.execute(createTable('custom_monsters'));
    await ctx.db.execute(
      `CREATE INDEX idx_custom_monsters_created_by ON custom_monsters(created_by)`,
    );

    await ctx.db.execute(createTable('custom_items'));
    await ctx.db.execute(
      `CREATE INDEX idx_custom_items_created_by ON custom_items(created_by)`,
    );

    await ctx.db.execute(createTable('custom_spells'));
    await ctx.db.execute(
      `CREATE INDEX idx_custom_spells_created_by ON custom_spells(created_by)`,
    );

    await ctx.db.execute(`PRAGMA user_version = 17`);
    ctx.logger.log(
      'Applied schema migration v17 (custom monsters/items/spells libraries)',
    );
  },
};
