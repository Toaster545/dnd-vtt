import { Migration } from './migration';

// ── V9: campaign/session background images ──────────────────────────────────
export const migrateV9: Migration = {
  version: 9,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE campaigns ADD COLUMN background_url TEXT`,
    );
    await ctx.db.execute(`ALTER TABLE sessions ADD COLUMN background_url TEXT`);

    await ctx.db.execute(`PRAGMA user_version = 9`);
    ctx.logger.log(
      'Applied schema migration v9 (campaign/session backgrounds)',
    );
  },
};
