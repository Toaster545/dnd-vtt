import { Migration } from './migration';
import { randomUUID } from 'crypto';
import { generateJoinCode } from '../join-code.util';

// ── V7: campaigns ─────────────────────────────────────────────────────────────
export const migrateV7: Migration = {
  version: 7,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id          TEXT PRIMARY KEY,
        dm_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        join_code   TEXT NOT NULL UNIQUE,
        data        TEXT NOT NULL DEFAULT '{}',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS campaign_members (
        id                  TEXT PRIMARY KEY,
        campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id             TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        character_id        TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        source_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
        status              TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','removed')),
        joined_at           TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // One active membership per player per campaign; removed rows stick around for history.
    await ctx.db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_members_active
      ON campaign_members(campaign_id, user_id) WHERE status = 'active'
    `);

    await ctx.db.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id          TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('campaign','session','encounter')),
        entity_id   TEXT NOT NULL,
        author_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        visibility  TEXT NOT NULL DEFAULT 'shared' CHECK(visibility IN ('shared','dm_only')),
        content     TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await ctx.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(entity_type, entity_id)
    `);

    await ctx.db.execute(
      `ALTER TABLE sessions ADD COLUMN campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE`,
    );
    await ctx.db.execute(
      `ALTER TABLE sessions ADD COLUMN visible_to_players INTEGER NOT NULL DEFAULT 0`,
    );
    await ctx.db.execute(
      `ALTER TABLE characters ADD COLUMN campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL`,
    );
    await ctx.db.execute(
      `ALTER TABLE encounters ADD COLUMN visible_to_players INTEGER NOT NULL DEFAULT 0`,
    );
    await ctx.db.execute(
      `ALTER TABLE encounters ADD COLUMN summary TEXT NOT NULL DEFAULT ''`,
    );

    // Backfill: every DM who already has sessions gets a "Legacy Campaign" so their existing
    // sessions (and, transitively, encounters) aren't orphaned by the new required campaign_id.
    const dms = await ctx.db.execute(
      `SELECT DISTINCT dm_id FROM sessions WHERE dm_id IS NOT NULL`,
    );
    for (const row of dms.rows) {
      const dmId = row.dm_id as string;
      const campaignId = randomUUID();
      let joinCode: string;
      do {
        joinCode = generateJoinCode();
      } while (
        (
          await ctx.db.execute(`SELECT id FROM campaigns WHERE join_code = ?`, [
            joinCode,
          ])
        ).rows.length > 0
      );

      await ctx.db.execute(
        `INSERT INTO campaigns (id, dm_id, name, join_code) VALUES (?, ?, 'Legacy Campaign', ?)`,
        [campaignId, dmId, joinCode],
      );
      await ctx.db.execute(
        `UPDATE sessions SET campaign_id = ? WHERE dm_id = ?`,
        [campaignId, dmId],
      );
    }

    await ctx.db.execute(`PRAGMA user_version = 7`);
    ctx.logger.log('Applied schema migration v7 (campaigns)');
  },
};
