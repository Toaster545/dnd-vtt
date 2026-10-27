# Task 05: Use parseJson where the fallback is already the behaviour
Depends on: none          Mode: Act

## Goal
Replace one ad hoc try/catch JSON parse that already falls back silently with `DatabaseService.parseJson`, and document the sites deliberately left alone.

## Context you need
- `DatabaseService.parseJson<T>(value: string | null, fallback: T): T` in `dnd_vtt_backend/src/common/database.service.ts:38` returns the fallback for empty/invalid input.
- Safe site: `dnd_vtt_backend/src/maps/maps.service.ts` `parseWalls(raw: unknown)` (~line 810): returns `[]` on non-string, parse error, or non-array. `MapsService` already has `this.db` (see line ~565).
- Deliberately NOT changed (silent fallback would hide corruption or they are file reads): `characters/inventory.service.ts:51` (reads a content file), `content/class-content/class-content-test.utils.ts`, `content/content.service.ts` JSON.parse of `row.data` and file reads (~61, 75, 96, 430, 447, 479, 564 — the last one is written back), `common/migrations/v035.ts:19`.

## Files
- Edit: `dnd_vtt_backend/src/maps/maps.service.ts` — rewrite `parseWalls`

## Steps
1. Rewrite as: if `typeof raw !== 'string'` return `[]`; `const parsed = this.db.parseJson<unknown>(raw, []);` return `Array.isArray(parsed) ? (parsed as MapWall[]) : []`. Keep the signature.
2. If `parseWalls` is a non-method (no `this`), keep it a method; do not change its callers.

## Done when
- [ ] `cd dnd_vtt_backend && npm run build && npm test -- maps` pass
- [ ] `grep -n "JSON.parse" dnd_vtt_backend/src/maps/maps.service.ts` prints nothing

## Out of scope
- Any site listed as deliberately unchanged; `MigrationContext`.

## When finished
Tick the boxes above in this file and add a 2-line "Result:" note (what changed, anything odd).
