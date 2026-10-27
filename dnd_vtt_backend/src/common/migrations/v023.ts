import { Migration } from './migration';

// ── V23: per-campaign Obsidian-style wiki ────────────────────────────────────
// `wiki_pages` are titled markdown documents scoped to one campaign, organised by a `folder`
// path string (''=root, e.g. 'Lore/NPCs'). `[[wikilinks]]` in a page body are stored as text;
// `wiki_page_links` materialises each outgoing link on every save, resolving `target_slug` to
// a `target_page_id` when a page with that slug exists (null = an unresolved "red link").
// Backlinks are just the inverse of that table. `wiki_page_versions` snapshots the body on
// every write (last-write-wins, guarded by `updated_at`). `wiki_pages_fts` is an FTS5 index
// kept in sync by hand in WikiService alongside every page mutation.
//
// Numbered v23 (not v22) and starts by dropping `oidc_payloads`/`wiki_campaign_links`: an
// earlier, fully-reverted attempt at this feature (a self-hosted Outline instance wired up
// via OIDC) briefly ran its own migrations against dev databases and left `user_version` at
// 22 with those two now-dead tables in place, even though the code for them was reverted.
// That stray version number would make a real v22 here get skipped on those databases, so
// this picks up at v23 and clears the leftovers as it goes; harmless IF EXISTS on every other
// database, which never saw that attempt.
export const migrateV23: Migration = {
  version: 23,
  async up(ctx) {
    await ctx.db.execute(`DROP TABLE IF EXISTS oidc_payloads`);
    await ctx.db.execute(`DROP TABLE IF EXISTS wiki_campaign_links`);

    await ctx.db.execute(`
      CREATE TABLE wiki_pages (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        slug        TEXT NOT NULL,
        folder      TEXT NOT NULL DEFAULT '',
        body        TEXT NOT NULL DEFAULT '',
        visibility  TEXT NOT NULL DEFAULT 'shared' CHECK(visibility IN ('shared','dm_only')),
        author_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        updated_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await ctx.db.execute(
      `CREATE UNIQUE INDEX idx_wiki_pages_slug ON wiki_pages(campaign_id, slug)`,
    );
    await ctx.db.execute(
      `CREATE INDEX idx_wiki_pages_campaign ON wiki_pages(campaign_id)`,
    );

    await ctx.db.execute(`
      CREATE TABLE wiki_page_links (
        source_page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        target_slug    TEXT NOT NULL,
        target_page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
        PRIMARY KEY (source_page_id, target_slug)
      )
    `);
    await ctx.db.execute(
      `CREATE INDEX idx_wiki_page_links_target ON wiki_page_links(target_page_id)`,
    );
    await ctx.db.execute(
      `CREATE INDEX idx_wiki_page_links_target_slug ON wiki_page_links(target_slug)`,
    );

    await ctx.db.execute(`
      CREATE TABLE wiki_page_versions (
        id         TEXT PRIMARY KEY,
        page_id    TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        folder     TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL,
        editor_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await ctx.db.execute(
      `CREATE INDEX idx_wiki_page_versions_page ON wiki_page_versions(page_id, created_at)`,
    );

    await ctx.db.execute(`
      CREATE VIRTUAL TABLE wiki_pages_fts USING fts5(
        page_id UNINDEXED,
        campaign_id UNINDEXED,
        title,
        body,
        tokenize = 'porter unicode61'
      )
    `);

    await ctx.db.execute(`PRAGMA user_version = 23`);
    ctx.logger.log('Applied schema migration v23 (campaign wiki)');
  },
};
