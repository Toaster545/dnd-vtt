import { Migration } from './migration';

// ── V33: ambient light level/color ────────────────────────────────────────────
// A map-wide brightness/tint for the darkness overlay, independent of any torch:
// `ambient_level` 0-100 (0 = pitch black outside torchlight; as it rises, that black mask
// fades while `ambient_color` washes in more strongly, so a bright ambience reads as "the room
// glows that color" rather than "fading to a plain view of the map"). Defaults (0, '#0a0a14')
// reproduce the old hardcoded darkness exactly for every map that already has lighting
// configured, since the color wash has zero strength at level 0 regardless of color.
export const migrateV33: Migration = {
  version: 33,
  async up(ctx) {
    await ctx.db.execute(
      `ALTER TABLE map_lighting ADD COLUMN ambient_level INTEGER NOT NULL DEFAULT 0`,
    );
    await ctx.db.execute(
      `ALTER TABLE map_lighting ADD COLUMN ambient_color TEXT NOT NULL DEFAULT '#0a0a14'`,
    );
    await ctx.db.execute(`PRAGMA user_version = 33`);
    ctx.logger.log('Applied schema migration v33 (ambient light level/color)');
  },
};
