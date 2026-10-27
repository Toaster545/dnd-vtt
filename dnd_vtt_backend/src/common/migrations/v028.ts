import { Migration } from './migration';

// ── V28: DM-chosen level per player ───────────────────────────────────────────
// Which level each player is shown is the DM's explicit call, not wherever a token happens to
// be: a character can have a token on several levels at once (the DM stages the next floor
// first), and the DM then switches the player over. Only honoured while that character still
// has a token on the chosen level; otherwise the player falls back to the entry level.
export const migrateV28: Migration = {
  version: 28,
  async up(ctx) {
    await ctx.db.execute(`
      CREATE TABLE encounter_player_levels (
        encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
        character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        map_id       TEXT NOT NULL REFERENCES battle_maps(id) ON DELETE CASCADE,
        PRIMARY KEY (encounter_id, character_id)
      )
    `);
    await ctx.db.execute(`PRAGMA user_version = 28`);
    ctx.logger.log(
      'Applied schema migration v28 (per-player encounter levels)',
    );
  },
};
