# 0002 Hand-rolled migrations gated by `PRAGMA user_version`, no ORM

Purpose: records the schema-migration approach.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
Commit `0281d76` initialised the schema on startup with "no migration files needed". Later schema changes needed a versioned mechanism.

## Decision
Each migration is a file `src/common/migrations/vNNN.ts` exporting a `Migration` (`version`, `up(ctx)`), registered in order in `migrations/index.ts`. The version is kept in `PRAGMA user_version`; the runner throws if a migration does not stamp it or if the registry is out of order. CLAUDE.md states there is no ORM and no separate migration tool, and that migrations must not depend on current content files (v035 is a historical exception). `PRAGMA user_version` first appears in history in `7515a40` (Items and spells); the one-file-per-version layout appears in `00cb49a`. The reason for choosing this over an ORM is not recorded in the repo.

## Consequences
- Services use raw SQL; schema knowledge is in the migration files ([data-model](../data-model.md)).
- Gaps in numbering are allowed ([0004](0004-no-migration-v022.md)).

Date: 2026-07-24 (versioning), 2026-10-26 (file layout)
Commit: `7515a40`, `00cb49a`

Sources: `CLAUDE.md` (Database), `dnd_vtt_backend/src/common/database.service.ts`, `dnd_vtt_backend/src/common/migrations/index.ts`, `dnd_vtt_backend/src/common/migrations/migration.ts`, [storage](../architecture/storage.md).
