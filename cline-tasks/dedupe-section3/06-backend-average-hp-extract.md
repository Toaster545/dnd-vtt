# Task 06: Extract backend average-HP formula into a pure function
Depends on: 03          Mode: Act

## Goal
Make the backend's average-HP math a pure exported function so it can be parity-tested against the frontend (task 07).

## Context you need
- `dnd_vtt_backend/src/characters/characters.service.ts` ~lines 560-583: private `estimateAverageMaxHp(data, level)` resolves the primary class hit die and CON modifier, then computes `Math.max(1, hitDie + conMod + (level - 1) * (Math.floor(hitDie / 2) + 1 + conMod))`.
- Frontend equivalent: `averageHpFormula(level, hitDie, conMod, perLevelBonus = 0)` in `dnd_vtt_frontend/src/app/core/utils/character-effects.ts:161` (do not edit).
- Task 03 added `abilityModifier` in `dnd_vtt_backend/src/common/ability.ts`; reuse it.

## Files
- Create: `dnd_vtt_backend/src/characters/average-hp.ts` — `export function averageHp(level: number, hitDie: number, conMod: number): number`
- Edit: `dnd_vtt_backend/src/characters/characters.service.ts` — `estimateAverageMaxHp` keeps resolving hitDie/conMod, then returns `averageHp(level, hitDie, conMod)`

## Steps
1. Create the function with the `Math.max(1, ...)` formula above.
2. Call it from `estimateAverageMaxHp`; leave the "Mirrors" comment pointing at the parity test (task 07).

## Done when
- [ ] `cd dnd_vtt_backend && npm run build && npm test -- characters` pass

## Out of scope
- Frontend; adding perLevelBonus; changing level-change detection.

## When finished
Tick the boxes above in this file and add a 2-line "Result:" note (what changed, anything odd).
