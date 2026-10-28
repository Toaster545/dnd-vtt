# API: the unauthenticated list of app background images under `/api/backgrounds`.

Last updated: 2026-10-28 (commit 00cb49a)

`BackgroundsController` has no guard. It is unrelated to the D&D character backgrounds, which are served by `GET /api/content/backgrounds` ([content.md](content.md)).

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/backgrounds` | none | none | Array of `{ id, url }` for each image file in `<cwd>/uploads/backgrounds/` (extensions `.jpg .jpeg .png .webp .gif .avif`, sorted by name); `url` is `/uploads/backgrounds/<file>`. Empty array if the directory is missing |

Files are placed in the directory by hand; see [architecture/storage.md](../architecture/storage.md#uploads).

Sources: `dnd_vtt_backend/src/backgrounds/backgrounds.controller.ts` (`list`).
