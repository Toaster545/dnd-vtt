# Feature: campaign wiki — an in-app Markdown wiki per campaign with a live-preview editor, folders, links, search, shared and DM-only pages.

Last updated: 2026-10-28 (commit 00cb49a)

Endpoints, visibility rules and conflict handling: [api/wiki.md](../api/wiki.md); tables (`wiki_pages`, FTS index and satellite tables): [data-model.md](../data-model.md#wiki). Private character notes are a special page type, shown in [characters.md](characters.md#character-notes).

## Where it appears

| Place | Route / host | Notes |
|---|---|---|
| Full page, DM | `/home/campaigns/manage/:campaignId/wiki[/:slug]` (`data.wikiDm = true`) | `WikiComponent` reads the ids from the route and keeps the URL in sync with the current page |
| Full page, player | `/home/campaigns/:campaignId/wiki[/:slug]` (`wikiDm = false`) | Same component |
| Embedded in the four hubs | `WikiEmbedComponent` in the DM and player campaign hubs and session pages ([campaigns.md](campaigns.md), [sessions-and-encounters.md](sessions-and-encounters.md)) | Read-only by default with a Read/Edit toggle; opens on the page whose title matches the campaign name when one exists (`matchTitles`); remembers the last page per campaign in `localStorage` |
| Sheet Notes tab | `CharacterNotesComponent` | One private page per campaign character |

`WikiWorkspaceComponent` is routing-free (inputs `campaignId`, `isDm`, `slug`, `embedded`; output `slugChange`), which is what lets the hubs embed it.

Sources: `dnd_vtt_frontend/src/app/features/wiki/wiki.ts` (`WikiComponent`), `dnd_vtt_frontend/src/app/features/wiki/wiki-embed.ts`, `dnd_vtt_frontend/src/app/features/wiki/wiki-workspace.ts`, `dnd_vtt_frontend/src/app/app.routes.ts`.

## What the user can do

- **Browse.** A sidebar tree of folders and pages (resizable, width in `localStorage` key `wiki:sidebar:width`; expanded folders persisted). Pages are grouped by their `folder` path; folders are display-only and exist as long as a page has that path (empty "draft" folders live in the browser until a page uses them).
- **Edit.** A CodeMirror 6 editor (`WikiLiveEditorComponent`) with Obsidian-style live preview (`wiki-live-preview.ts`): Markdown stays the source text and is rendered inline; typing `[[` completes page titles; images can be pasted or dropped and are uploaded (`uploadImage`). Title and body autosave after 1.5 s (`SAVE_DEBOUNCE_MS`) and on unload; the update sends the page's `updated_at` as `expectedUpdatedAt`, so a concurrent edit gives `409`; the workspace then sets a conflict state, from which the user can reload the server copy (`reloadFromServer`) or save again with `force`, which omits `expectedUpdatedAt`.
- **Organise.** Create, rename, move, delete pages; create, rename and delete folders; drag and drop pages and folders in the tree; context menus.
- **Visibility.** The DM can toggle a page between `shared` and `dm_only`; players' new pages are always `shared`.
- **Find.** Search box (`GET /api/wiki/:campaignId/search`, FTS index) and backlinks for the current page. Wikilinks are resolved with a slug function that must match the backend's (`wiki-slug.ts` and `wikilink.util.ts`).

**Limitations.**
- `WikiService.graph` (`GET /api/wiki/:campaignId/graph`) exists, but no component calls it, so there is no graph view yet.
- Folders have no table of their own. Deleting a folder moves its pages to the parent folder (`deleteFolder`); it does not delete them.
- Character-notes pages cannot be deleted from the wiki (`400`); they are removed with the character.

Sources: `dnd_vtt_frontend/src/app/features/wiki/wiki-workspace.ts` (`loadTree`, `loadPage`, `flushSave`, `createPage`, `movePage`, `toggleVisibility`, `deletePage`, `renameFolder`, `onDrop`, `onSearchInput`, `SAVE_DEBOUNCE_MS`, `SIDEBAR_WIDTH_KEY`), `dnd_vtt_frontend/src/app/features/wiki/wiki-live-editor.ts`, `dnd_vtt_frontend/src/app/features/wiki/wiki-live-preview.ts`, `dnd_vtt_frontend/src/app/features/wiki/wiki-tree.ts`, `dnd_vtt_frontend/src/app/features/wiki/wiki-slug.ts`, `dnd_vtt_frontend/src/app/core/services/wiki.service.ts`, `dnd_vtt_backend/src/wiki/wiki.service.ts`, `dnd_vtt_backend/src/wiki/wikilink.util.ts`.
