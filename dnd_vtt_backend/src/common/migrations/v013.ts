import { Migration } from './migration';

// ── V13: fog of war starts fully visible — a map defaults to nothing hidden, the DM paints
// areas to hide rather than areas to reveal, so the stored set flips from "what's revealed" to
// "what's hidden" (an empty set now means "everything visible" instead of "everything hidden").
export const migrateV13: Migration = {
  version: 13,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE map_fog RENAME COLUMN revealed_cells TO hidden_cells`,
    );

    await ctx.db.execute(`PRAGMA user_version = 13`);
    ctx.logger.log('Applied schema migration v13 (fog defaults to visible)');
  },
};
