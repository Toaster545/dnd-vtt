import { Migration } from './migration';

// ── V27: multi-level encounters ────────────────────────────────────────────
// An encounter can span several maps (dungeon floors), ordered by `position`. Each level is
// just a battle map, so tokens/fog/lighting/walls stay per-level for free. A player sees the
// level their own character's token is on; `encounters.map_id` is kept as the entry level
// (position 0) — where a player with no token yet lands, and what older readers still use.
export const migrateV27: Migration = {
  version: 27,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE encounter_levels (
        encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
        map_id       TEXT NOT NULL REFERENCES battle_maps(id) ON DELETE CASCADE,
        position     INTEGER NOT NULL,
        PRIMARY KEY (encounter_id, map_id)
      )
    `);
    await ctx.db.execute(
      `CREATE INDEX idx_encounter_levels_map ON encounter_levels(map_id)`,
    );
    await ctx.db.execute(`
      INSERT INTO encounter_levels (encounter_id, map_id, position)
      SELECT e.id, e.map_id, 0 FROM encounters e
      JOIN battle_maps bm ON bm.id = e.map_id
    `);
    await ctx.db.execute(`PRAGMA user_version = 27`);
    ctx.logger.log('Applied schema migration v27 (multi-level encounters)');
  },
};
