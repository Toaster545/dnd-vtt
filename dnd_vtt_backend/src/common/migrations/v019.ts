import { Migration } from './migration';

// ── V19: explicit character-enabled and campaign-allowed content sources ────────────────
// Both entities already use extensible JSON data blobs. Persisting the choices there keeps
// source policy close to the character/campaign without adding one column per future book.
// Existing Artificers are opted into Eberron so the migration never makes a saved character
// internally inconsistent; every other existing character and campaign defaults to PHB only.
export const migrateV19: Migration = {
  version: 19,
  async up(ctx) {
    await ctx.db.execute(`
      UPDATE characters
      SET data = json_set(
        CASE WHEN json_valid(data) THEN data ELSE '{}' END,
        '$.enabled_sources',
        CASE
          WHEN lower(class) = 'artificer' THEN json('["XPHB","EFA"]')
          ELSE json('["XPHB"]')
        END
      )
      WHERE json_type(data, '$.enabled_sources') IS NULL
    `);
    await ctx.db.execute(`
      UPDATE campaigns
      SET data = json_set(
        CASE WHEN json_valid(data) THEN data ELSE '{}' END,
        '$.allowed_sources',
        json('["XPHB"]')
      )
      WHERE json_type(data, '$.allowed_sources') IS NULL
    `);

    await ctx.db.execute(`PRAGMA user_version = 19`);
    ctx.logger.log(
      'Applied schema migration v19 (character and campaign content sources)',
    );
  },
};
