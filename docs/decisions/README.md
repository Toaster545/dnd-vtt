# Architecture decision records

Purpose: index of decisions evidenced in code, CLAUDE.md or git history. Rationale not found there is stated as not recorded.

Last updated: 2026-10-28 (commit 00cb49a)

| ADR | Decision |
|---|---|
| [0001](0001-sqlite-libsql-instead-of-supabase.md) | SQLite via `@libsql/client` instead of Supabase |
| [0002](0002-hand-rolled-migrations.md) | Hand-rolled migrations gated by `PRAGMA user_version`, no ORM |
| [0003](0003-single-origin-behind-cloudflare-tunnel.md) | Single origin served by NestJS behind one Cloudflare Tunnel |
| [0004](0004-no-migration-v022.md) | No migration `v022` |
| [0005](0005-character-json-data-blob.md) | Character data in one JSON `data` column |
| [0006](0006-short-lived-access-jwt-with-rotating-refresh.md) | 15-minute access JWT with rotating refresh credential |
| [0007](0007-pwa-shell-only-cache-and-capacitor-wrapper.md) | PWA shell-only cache; Capacitor wraps the Angular build |
| [0008](0008-standalone-angular-components.md) | Standalone Angular components only |

Sources: `git log`, `CLAUDE.md`, files cited in each record.
