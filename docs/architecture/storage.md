# Storage architecture: the SQLite connection, hand-rolled migrations, uploaded files and where content JSON is read from.

Last updated: 2026-10-28 (commit 00cb49a)

Table-level detail (columns, relationships) belongs in the data-model doc. This file covers the mechanisms.

## `DatabaseService`

`DatabaseService` (`src/common/database.service.ts`) wraps one `@libsql/client` connection to a local SQLite file. It is provided and exported by `AuthModule`, so a single instance is shared by modules that import `AuthModule` (see [backend](backend.md#modules)).

- **Path:** `DB_PATH`, default `./data/dnd.db`, resolved relative to the working directory (`dbPath()` in `src/config.ts`). `onModuleInit` creates the parent directory if missing, opens `file:<path>`, then runs migrations. `dnd_vtt_backend/data/` is gitignored.
- **API:** `execute(sql, args)`, `executeMany(statements)` (a libsql `batch`), `parseJson(value, fallback)` (returns the fallback for empty or invalid JSON), `close()`.
- **Foreign keys:** `PRAGMA foreign_keys = ON` is issued at the start of `runMigrations`.
- **No ORM:** services write raw SQL. Character data is a JSON document in one `data` column (see the data-model doc).
- **Tests:** `src/common/test-db.util.ts` sets `DB_PATH=:memory:` so each spec runs every migration on a fresh in-memory database.

Sources: `dnd_vtt_backend/src/common/database.service.ts`, `dnd_vtt_backend/src/config.ts` (`dbPath`), `dnd_vtt_backend/src/common/test-db.util.ts`, `.gitignore`.

## Migrations

Schema changes are files `src/common/migrations/vNNN.ts`, each exporting a `Migration` (`{ version, up(ctx) }`, defined in `migration.ts`), registered in order in `migrations/index.ts` (`MIGRATIONS`). Schema version is stored in `PRAGMA user_version`.

`runMigrations` behaviour:

1. Reads `PRAGMA user_version`. If it is `0` but table `profiles` exists, the database is treated as version 1 (it predates versioning).
2. Calls `assertMigrationsOrdered(MIGRATIONS)`: versions must be strictly increasing in array order, else boot fails. Gaps are allowed.
3. For each migration with `version` greater than the current one, runs `up(ctx)`, then re-reads `PRAGMA user_version`. If it does not equal the migration's version, it throws `Migration vN did not stamp PRAGMA user_version`.

Migrations therefore stamp `PRAGMA user_version = N` themselves as their last step. `ctx` (`MigrationContext`) provides `db`, `logger`, `execute`, `executeMany`, `parseJson`.

Migrations run automatically on every server start, in `onModuleInit`; there is no separate migration tool or CLI.

**There is deliberately no v022.** An earlier, reverted attempt at the wiki feature (a self-hosted Outline instance via OIDC) ran its own migrations against dev databases and left `user_version` at 22 with two dead tables (`oidc_payloads`, `wiki_campaign_links`). A real v022 would have been skipped on those databases, so the wiki migration is `v023.ts`, which drops those tables with `IF EXISTS`. Never add a v022; use the next free number (currently files run `v001`–`v021` and `v023`–`v036`, the latest being v036, "private character notes in the wiki").

**Content dependency exception.** Migrations should not depend on current content files. `v035.ts` is a historical exception: it reads `content/items/*.json` to convert character inventories into the `inventory_instances` table, and first writes a backup copy of the database with `VACUUM INTO` (`<DB_PATH>.pre-inventory-<timestamp>.bak`) when characters exist.

Sources: `dnd_vtt_backend/src/common/database.service.ts` (`runMigrations`), `dnd_vtt_backend/src/common/migrations/migration.ts` (`assertMigrationsOrdered`), `dnd_vtt_backend/src/common/migrations/index.ts`, `dnd_vtt_backend/src/common/migrations/v023.ts`, `dnd_vtt_backend/src/common/migrations/v035.ts`.

## Uploads

Uploaded files are written to `<cwd>/uploads/<subdir>/` on the local disk. Stored URLs are relative (`/uploads/...`) so they work behind any host or tunnel; `main.ts` serves `/uploads` statically.

| Subdirectory | Written by | Notes |
|---|---|---|
| `uploads/maps/<campaignId>/` | `MapsService.saveImage` | Not served statically: `main.ts` answers `/uploads/maps` with `404`. Read back through authenticated map endpoints; `MapsService` checks the path stays under `uploads/maps` |
| `uploads/campaigns/<campaignId>/` | `CampaignsService` via `saveUploadedImage` | Campaign background image |
| `uploads/sessions/<sessionId>/` | `SessionsService` via `saveUploadedImage` | Session background image |
| `uploads/items/<itemId>/` | `ContentService` via `saveUploadedImage` | Custom item image |
| `uploads/wiki/<campaignId>/` | `WikiService` | Wiki images, campaign-scoped, 10 MiB limit |
| `uploads/portraits/<userId>/` | `CharactersService` | Character portraits, 2 MiB limit; URL pattern validated in `src/common/portrait-image.ts` |
| `uploads/backgrounds/` | placed manually | Listed by `BackgroundsController`; image extensions `.jpg .jpeg .png .webp .gif .avif` |
| `uploads/monster-tokens/`, `uploads/item-art/` | `scripts/download-monster-tokens.mjs`, `scripts/download-item-art.mjs` | Gitignored downloaded art; `ContentService` adds `art_url` for items whose art file exists |

`saveUploadedImage` names files `<Date.now()>_<original name with whitespace replaced by _>`. `.gitignore` lists `uploads/maps/`, `uploads/campaigns/`, `uploads/wiki/`, `uploads/monster-tokens/` and `uploads/item-art/`.

Sources: `dnd_vtt_backend/src/common/upload.util.ts`, `dnd_vtt_backend/src/maps/maps.service.ts` (`saveImage`), `dnd_vtt_backend/src/wiki/wiki.service.ts`, `dnd_vtt_backend/src/characters/characters.service.ts`, `dnd_vtt_backend/src/backgrounds/backgrounds.controller.ts`, `dnd_vtt_backend/src/main.ts`, `.gitignore`.

## Content JSON loading

Static game content is read from `<cwd>/content/` (`CONTENT_PATH` in `content.service.ts`) with `readdirSync` / `readFileSync` and cached in an in-memory `Map` for the life of the process; changing a file requires a restart. Layout and loading rules are in [content](content.md).

Sources: `dnd_vtt_backend/src/content/content.service.ts` (`loadAll`, `loadOne`).
