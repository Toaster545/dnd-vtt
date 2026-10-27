import { Migration } from './migration';

// ── V8: relative map image URLs ──────────────────────────────────────────────
// Uploaded map images used to be stored with a baked-in absolute host (defaulting to
// http://localhost:3000). That's wrong for anything accessed through a different host — e.g. a
// Cloudflare Tunnel domain — and outright breaks under https (mixed-content blocking). Strip any
// existing `scheme://host[:port]` prefix down to the relative `/uploads/...` path, which resolves
// correctly against whatever origin actually served the page. See MapsService.uploadImage.
export const migrateV8: Migration = {
  version: 8,
  async up(ctx) {
    const rows = await ctx.db.execute(
      `SELECT id, image_url FROM battle_maps WHERE image_url LIKE 'http://%' OR image_url LIKE 'https://%'`,
    );
    for (const row of rows.rows) {
      const url = row.image_url as string;
      const relative = url.replace(/^https?:\/\/[^/]+/, '');
      await ctx.db.execute(
        `UPDATE battle_maps SET image_url = ? WHERE id = ?`,
        [relative, row.id],
      );
    }

    await ctx.db.execute(`PRAGMA user_version = 8`);
    ctx.logger.log(
      `Applied schema migration v8 (relative map image URLs, fixed ${rows.rows.length} row(s))`,
    );
  },
};
