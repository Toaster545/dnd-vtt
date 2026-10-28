# 0004 Migration `v022` is intentionally absent

Purpose: records why the migration registry skips version 22.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
An earlier, reverted attempt at the wiki feature (a self-hosted Outline instance wired up through OIDC) ran its own migrations against dev databases. The header comment in `v023.ts` describes this, and `v023.ts` first drops `oidc_payloads` and `wiki_campaign_links`.

## Decision
The wiki migration is numbered `v023`. CLAUDE.md: "There is deliberately no v022 — never add one; use the next free number." The runner allows gaps.

## Consequences
- Migration numbers are not contiguous; new migrations use the next free number.
- Databases that ran the reverted attempt are cleaned by `v023`.

Date: 2026-08-29 (wiki implementation), 2026-10-26 (current files)
Commit: `401da5f` (Wiki implementation (#61); first appearance of `oidc_payloads` in history), `00cb49a`

Sources: `dnd_vtt_backend/src/common/migrations/v023.ts` (header comment), `CLAUDE.md` (Database), [storage](../architecture/storage.md).
