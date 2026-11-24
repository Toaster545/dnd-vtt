# Task 04: Move backend itemDisplayName to a typed shared helper
Depends on: none          Mode: Act

## Goal
Pull the private backend `itemDisplayName` out of `characters.service.ts` into `common/` with a precise input type matching the frontend's.

## Context you need
- Backend copy: `dnd_vtt_backend/src/characters/characters.service.ts` lines ~31-39, typed `(item: Record<string, unknown>)`, used at ~line 800 (`name: itemDisplayName(item)`).
- Frontend original (do not edit): `dnd_vtt_frontend/src/app/core/services/content.service.ts:506`, typed `Pick<DndItem, 'name' | 'enhancement_bonus'>`; output is `"Longsword +1"`, `"Dagger -1"`, or plain name when bonus is missing/0.
- Backend must stay tolerant of untyped JSON content, so the new type is `{ name?: unknown; enhancement_bonus?: unknown }` (accepts `Record<string, unknown>` too).

## Files
- Create: `dnd_vtt_backend/src/common/item-display-name.ts` — exported `itemDisplayName(item: ItemNameFields): string` with same behaviour as today, plus exported `ItemNameFields` interface
- Create: `dnd_vtt_backend/src/common/item-display-name.spec.ts` — cases: plain, +1, -1, 0, non-number bonus, missing name -> ''
- Edit: `dnd_vtt_backend/src/characters/characters.service.ts` — delete local function and its "Mirrors" comment, import the new one

## Steps
1. Move the function verbatim, change only the parameter type.
2. Update the import in `characters.service.ts`; keep the call site unchanged.

## Done when
- [ ] `cd dnd_vtt_backend && npm run build && npm test -- common/item-display-name characters` pass
- [ ] `grep -n "function itemDisplayName" dnd_vtt_backend/src -r` shows only the new file

## Out of scope
- The frontend function; changing display format.

## When finished
Tick the boxes above in this file and add a 2-line "Result:" note (what changed, anything odd).
