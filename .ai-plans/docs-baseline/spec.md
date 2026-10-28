# Documentation baseline
Slug: docs-baseline     Date: 2026-10-28

## Goal
Create the project's first complete documentation set under `docs/` using the `documenter` agent's
layout, accurate to commit 00cb49a, so humans and coding agents have a trustworthy description of
the app. This is also the first end-to-end test of the /pipeline workflow.

## Requirements
- R1 `docs/README.md` indexes every doc with a one-line purpose and carries `Documented up to: <sha> (date)`.
- R2 `docs/overview.md` states what the app is, the stack, repo layout and the commands to run/build/test.
- R3 Backend architecture is documented per area (modules, auth/guards, storage and migrations, realtime socket.io, content).
- R4 Frontend architecture is documented (routing, core/ services, utils, features, shared, styling, PWA/Capacitor pointers).
- R5 `docs/data-model.md` lists the SQLite tables/entities, key fields, relationships and where each is defined, including the JSON character `data` blob and the migration mechanism.
- R6 `docs/api/` documents every REST endpoint and socket event, grouped by backend module.
- R7 `docs/features/` has one file per user-facing feature (what it does, front/back flow, key files, limitations).
- R8 `docs/operations/` documents configuration (env var NAMES only), deployment (Cloudflare Tunnel), scripts and troubleshooting.
- R9 Existing `docs/mobile/*` is kept, checked against the code, and indexed.
- R10 `docs/CHANGELOG.md` has a "Documentation baseline" entry; `docs/decisions/` records only decisions evidenced in code/git history.

## Acceptance criteria
- A1 Every doc starts with a one-line purpose and `Last updated: YYYY-MM-DD (commit <sha>)`, and each section of content docs ends with `Sources:` paths (pure index files are exempt). (R1-R10)
- A2 Every relative link in `docs/` resolves to an existing file/heading. (R1-R10)
- A3 A reviewer spot-check of >= 10 factual claims per area (routes, env vars, table names, file paths, commands) finds no false statements. (R3-R8)
- A4 Every backend module under `dnd_vtt_backend/src/` and every feature folder under `dnd_vtt_frontend/src/app/features/` is covered by at least one doc or listed in "Not yet documented". (R3, R4, R7)
- A5 No secrets or `.env` values appear in docs. (R8)
- A6 No files outside `docs/` are modified. (all)

## Non-goals
- Editing `CLAUDE.md`, the root `README.md`, `TODO.md`, `NOTICE.md`, `cline-tasks/`, `.ai-plans/` (not owned by the documenter; contradictions are reported, not fixed).
- Documenting planned or unimplemented behaviour as current.
- Any source-code, config or test changes.

## Constraints and conventions
- Follow `.claude/agents/documenter.md` (layout, rules, CHANGELOG format). No `docs/GUIDELINES.md` exists yet; when added, the docs will be reworked to match.
- Verify against code before stating a fact; mark `(unverified)` otherwise.
- Ignore `dnd_vtt_backend/content/**` bulk data except to describe its schema and layout.

## Affected areas
- `docs/` only.

## Test expectations
- No code changes, so no unit/integration tests. Verification is by the reviewer (A2, A3, A5, A6) plus a link/secret grep.

## Documentation impact
- This run IS the documentation.

## Decisions made in ideation
- Dirty tree (uncommitted deletion of CODEBASE_INCONSISTENCIES.md) -> stash for the run; user pops it afterwards.
- No guidelines yet -> use documenter.md defaults.
- Scope -> full baseline, all areas.
- Executor -> documenter (Claude) writes; reviewer checks claims; Qwen split/execute and the tests stage are skipped.

## Open items
- User's documentation guidelines are pending; expect a rework pass later.
- The root README.md (299 lines) and CLAUDE.md overlap with docs/overview.md; documenter links rather than duplicates.

## Amendments after the run (user decisions)
- Documented up to = last code commit + its own date. Index files are exempt from per-section Sources:.
