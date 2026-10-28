# API: campaign wiki pages, search, link graph, image upload and character notes under `/api/wiki`.

Last updated: 2026-10-28 (commit 00cb49a)

`WikiController` has `@UseGuards(JwtGuard)`. Every campaign-scoped route first calls `WikiService.assertAccess`: `404` if the campaign does not exist, `403` unless the caller is the DM or an active member. Table details: [data-model.md](../data-model.md#wiki). Conventions: [README.md](README.md#conventions).

**Visibility.** A page is visible to a caller if it is the caller's own private page (`owner_id`), or a public page that is `shared` or the caller is the DM (`dm_only`). Pages the caller may not see answer `404`, not `403`, so their existence does not leak.

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/wiki` | JWT (DM or member) | Query `campaignId` | Page tree rows `{ id, title, slug, folder, visibility, owner_id, character_id, updated_at, updated_by_name }`, ordered by folder then title. Creates the caller's character-notes pages first if missing |
| GET | `/wiki/character/:characterId` | JWT (owner of a campaign character) | none | `{ campaignId, slug }` of the character's private notes page; `404` unless the character is the caller's and in a campaign |
| GET | `/wiki/:campaignId/search` | JWT (DM or member) | Query `q` | Up to 30 hits `{ id, title, slug, folder, snippet }` from the FTS5 index; empty array for an empty query |
| GET | `/wiki/:campaignId/graph` | JWT (DM or member) | none | `{ nodes: [{ id, title, slug, folder }], edges }` over visible pages with resolved links |
| POST | `/wiki/:campaignId/upload` | JWT (DM or member) | multipart `file` (image types only, max 10 MiB) | `{ url }` under `uploads/wiki/<campaignId>/`; `400` if no file or not an image |
| GET | `/wiki/:campaignId/page/:slug` | JWT (DM or member) | none | `{ page, backlinks }`; `page` includes `author_name` and `updated_by_name` |
| POST | `/wiki` | JWT (DM or member) | `{ campaignId, title (≤ 200), folder? (≤ 500), body?, visibility? ('shared' \| 'dm_only') }` | Creates the page and returns it as `GET .../page/:slug` would. Slug is derived from the title and made unique. `dm_only` is honoured only for the DM, otherwise the page is `shared`. `400` for an empty title |
| PUT | `/wiki/:id` | JWT (DM or member) | `{ title?, folder?, body?, visibility?, expectedUpdatedAt? }` | Updates the page. `403` for a `dm_only` page when the caller is not the DM; `409` if `expectedUpdatedAt` is given and differs from the stored `updated_at`; omit it to force the write |
| DELETE | `/wiki/:id` | JWT (DM or page author) | none | `400` for a character-notes page (it is removed with the character); `403` if the caller is neither DM nor author |

Route order matters: `GET /wiki/character/:characterId` is declared before the `:campaignId/...` routes.

Sources: `dnd_vtt_backend/src/wiki/wiki.controller.ts`, `dnd_vtt_backend/src/wiki/wiki.service.ts` (`tree`, `characterNotes`, `getPage`, `search`, `graph`, `create`, `update`, `remove`, `uploadImage`, `assertAccess`, `visibleSql`, `canSee`), `dnd_vtt_backend/src/wiki/dto/`.
