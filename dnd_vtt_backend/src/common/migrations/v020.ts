import { Migration } from './migration';

// ── V20: provider-owned spell access ──────────────────────────────────────
// Spell records now describe only the spell itself. Classes, subclasses, species,
// backgrounds, feats, and class features own their spell-list/grant relationships, and the
// API derives reverse access metadata from those providers. Strip the obsolete reverse fields
// from existing homebrew spell JSON so static and database-backed spells use the same shape.
export const migrateV20: Migration = {
  version: 20,
  async up(ctx) {
    await ctx.db.execute(`
      UPDATE custom_spells
      SET data = json_remove(
        data,
        '$.classes',
        '$.subclasses',
        '$.species',
        '$.backgrounds',
        '$.feats',
        '$.other_options'
      )
      WHERE json_valid(data)
    `);
    await ctx.db.execute(`PRAGMA user_version = 20`);
    ctx.logger.log(
      'Applied schema migration v20 (provider-owned spell access)',
    );
  },
};
