import { Migration } from './migration';

// ── V15: DM-controlled per-member party list visibility — hidden from the rest of the party
// by default (the DM opts each member in), but always visible to the DM and to the member
// themselves (see CampaignsService.deserializeMember / findOne's post-query filter).
export const migrateV15: Migration = {
  version: 15,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE campaign_members ADD COLUMN visible_to_party INTEGER NOT NULL DEFAULT 0`,
    );

    await ctx.db.execute(`PRAGMA user_version = 15`);
    ctx.logger.log(
      'Applied schema migration v15 (campaign member party visibility)',
    );
  },
};
