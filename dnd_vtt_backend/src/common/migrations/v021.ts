import { Migration } from './migration';

// ── V21: mobile player context, secure sessions, drafts, and visibility ───────────────
export const migrateV21: Migration = {
  version: 21,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE campaigns ADD COLUMN current_session_id TEXT`,
    );
    await ctx.db.execute(
      `ALTER TABLE battle_maps ADD COLUMN visibility_revision INTEGER NOT NULL DEFAULT 0`,
    );
    await ctx.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN visible_to_players INTEGER NOT NULL DEFAULT 1`,
    );
    await ctx.db.execute(
      `ALTER TABLE map_tokens ADD COLUMN name_visible_to_players INTEGER NOT NULL DEFAULT 1`,
    );
    await ctx.db.execute(
      `ALTER TABLE characters ADD COLUMN creation_status TEXT NOT NULL DEFAULT 'complete' CHECK(creation_status IN ('draft','complete'))`,
    );
    await ctx.db.execute(
      `ALTER TABLE characters ADD COLUMN draft_step INTEGER NOT NULL DEFAULT 0`,
    );
    await ctx.db.execute(`
      CREATE TABLE auth_sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        client_type TEXT NOT NULL CHECK(client_type IN ('web','native')),
        expires_at  TEXT NOT NULL,
        revoked_at  TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT
      )
    `);
    await ctx.db.execute(
      `CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id)`,
    );
    await ctx.db.execute(
      `CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at)`,
    );
    await ctx.db.execute(`PRAGMA user_version = 21`);
    ctx.logger.log(
      'Applied schema migration v21 (mobile context, secure auth, drafts, visibility)',
    );
  },
};
