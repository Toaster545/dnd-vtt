import { Migration } from './migration';

// ── V36: private character notes in the wiki ──────────────────────────────────
// `owner_id` marks a page as visible to that one user only (not even the campaign DM), and
// `character_id` ties it to the campaign character it is the notebook for. Columns rather than
// a third `visibility` value because that CHECK constraint can't be altered without rebuilding
// the table (and its FTS/link/version satellites). Deleting the character or the user takes
// the page with it.
export const migrateV36: Migration = {
  version: 36,
  async up(ctx) {
    const existing = new Set(
      (await ctx.db.execute(`PRAGMA table_info(wiki_pages)`)).rows.map(
        (r) => r.name as string,
      ),
    );
    if (!existing.has('owner_id'))
      await ctx.db.execute(
        `ALTER TABLE wiki_pages ADD COLUMN owner_id TEXT REFERENCES profiles(id) ON DELETE CASCADE`,
      );
    if (!existing.has('character_id'))
      await ctx.db.execute(
        `ALTER TABLE wiki_pages ADD COLUMN character_id TEXT REFERENCES characters(id) ON DELETE CASCADE`,
      );
    await ctx.db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_pages_character ON wiki_pages(character_id) WHERE character_id IS NOT NULL`,
    );
    await ctx.db.execute(`PRAGMA user_version = 36`);
    ctx.logger.log('Applied schema migration v36 (private character notes)');
  },
};
