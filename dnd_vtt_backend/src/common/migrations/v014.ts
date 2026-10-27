import { Migration } from './migration';

// ── V14: player-controlled race/class visibility in the campaign roster — hidden from the rest
// of the party by default, the DM always sees it regardless (see CampaignsService.deserializeMember).
export const migrateV14: Migration = {
  version: 14,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE campaign_members ADD COLUMN show_race_class INTEGER NOT NULL DEFAULT 0`,
    );

    await ctx.db.execute(`PRAGMA user_version = 14`);
    ctx.logger.log(
      'Applied schema migration v14 (campaign member race/class visibility)',
    );
  },
};
