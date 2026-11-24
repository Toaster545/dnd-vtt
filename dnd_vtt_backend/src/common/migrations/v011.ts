import { Migration } from './migration';

// ── V11: DM-grantable full edit access to a player's campaign character copy ────
export const migrateV11: Migration = {
  version: 11,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE campaign_members ADD COLUMN edit_unlocked INTEGER NOT NULL DEFAULT 0`,
    );

    await ctx.db.execute(`PRAGMA user_version = 11`);
    ctx.logger.log(
      'Applied schema migration v11 (campaign member edit access)',
    );
  },
};
