# Task 01: Consolidate toContentIndex / toIndex on the frontend
Depends on: none          Mode: Act

## Goal
Replace the six private copies of the name-to-content-index helper with one exported function.

## Context you need
- Six identical copies: `function toContentIndex(name: string): string { return name.toLowerCase().replace(/\s+/g, '-'); }` in the files below; `character-play-sheet.ts` calls it `toIndex` (line ~105, used at ~1145, 1148, 1159).
- Frontend files have no `.component.ts` suffix; pure helpers live in `dnd_vtt_frontend/src/app/core/utils/`. Single quotes, 100-char width.
- Imports from features use relative paths (e.g. `'../../../../core/utils/error-message'`).

## Files
- Create: `dnd_vtt_frontend/src/app/core/utils/content-index.ts` — `export function toContentIndex(name: string): string` (same body as above)
- Create: `dnd_vtt_frontend/src/app/core/utils/content-index.spec.ts` — Vitest: "Fire Bolt" -> "fire-bolt", "Half  Elf" -> "half-elf", "fighter" unchanged
- Edit: `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-campaign-session/dm-campaign-session.ts` (def line ~32)
- Edit: `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-campaign-hub/dm-campaign-hub.ts` (def ~26)
- Edit: `dnd_vtt_frontend/src/app/features/dashboard/dashboard.ts` (def ~25)
- Edit: `dnd_vtt_frontend/src/app/features/player/player-campaigns/player-campaign-session/player-campaign-session.ts` (def ~42)
- Edit: `dnd_vtt_frontend/src/app/features/player/player-view/player-view.ts` (def ~19)
- Edit: `dnd_vtt_frontend/src/app/features/characters/character-play-sheet/character-play-sheet.ts` (def `toIndex` ~105)

## Steps
1. Create the util and its spec.
2. In each of the six files delete the local function, add `import { toContentIndex } from '<relative>/core/utils/content-index';`, and (play sheet) rename `toIndex(` call sites to `toContentIndex(`.
3. Run `cd dnd_vtt_frontend && npx prettier --write` on the edited files.

## Done when
- [ ] `grep -rn "function toContentIndex\|function toIndex" dnd_vtt_frontend/src` shows only the util
- [ ] `cd dnd_vtt_frontend && npx ng build --configuration development` succeeds
- [ ] `cd dnd_vtt_frontend && npx ng test --watch=false` passes

## Out of scope
- Any other refactor in those files; backend code.

## When finished
Tick the boxes above in this file and add a 2-line "Result:" note (what changed, anything odd).
