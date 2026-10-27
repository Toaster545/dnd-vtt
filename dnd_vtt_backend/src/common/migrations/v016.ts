import { Migration } from './migration';

// ── V16: per-user "last visited" tracking for campaigns, so the campaign list can be ordered
// by recency of use rather than just creation date — one row per (campaign, user), upserted
// every time that user successfully loads the campaign hub (see CampaignsService.findOne).
export const migrateV16: Migration = {
  version: 16,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE campaign_visits (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        visited_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, user_id)
      )
    `);

    await ctx.db.execute(`PRAGMA user_version = 16`);
    ctx.logger.log(
      'Applied schema migration v16 (campaign last-visited tracking)',
    );
  },
};
