# 0001 SQLite (`@libsql/client`) instead of Supabase

Purpose: records why storage is a local SQLite file accessed through `@libsql/client`.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
The first version used Supabase (auth, database, realtime). CLAUDE.md states the project is self-hosted and runs on one machine with no cloud services. The self-hosting motive is inferred from CLAUDE.md; it is not recorded in the commit message of `0281d76`.

## Decision
Commit `0281d76` replaced `@supabase/supabase-js` with `@libsql/client` (SQLite), bcrypt plus `@nestjs/jwt` for auth, local disk storage for map images, and a socket.io gateway for realtime. The database path comes from `DB_PATH`.

## Consequences
- No external services; data lives in one file and in `uploads/`.
- Services write raw SQL; there is no ORM (see [0002](0002-hand-rolled-migrations.md)).
- Auth, storage and realtime are the app's own code ([auth](../architecture/auth.md), [storage](../architecture/storage.md), [realtime](../architecture/realtime.md)).

Date: 2026-07-24
Commit: `0281d76` (Replace Supabase with SQLite + custom auth + WebSockets)

Sources: `CLAUDE.md` (Project, Database), `dnd_vtt_backend/src/common/database.service.ts`, `git show 0281d76`.
