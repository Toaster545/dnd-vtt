# 0005 Character data in a single JSON `data` column

Purpose: records the storage shape of character records.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
The `characters` table created in `0281d76` holds indexed scalar columns (name, race, class, level and others) alongside JSON text columns.

## Decision
CLAUDE.md: "Character data lives in a single JSON `data` blob column; character records are read/written as a loosely-typed JSON document, not normalized columns." Newer code writes `camelCase` fields in the blob; fields mirroring a column stay `snake_case`. The reason for choosing JSON over normalised tables is not recorded in the repo.

## Consequences
- New character fields need no migration; renaming blob fields needs a data migration (CLAUDE.md, Conventions).
- Shape and defining migrations: [data-model](../data-model.md), [characters](../features/characters.md).

Date: 2026-07-24 (table created)
Commit: `0281d76`

Sources: `CLAUDE.md` (Database, Conventions), `dnd_vtt_backend/src/common/migrations/v001.ts`.
