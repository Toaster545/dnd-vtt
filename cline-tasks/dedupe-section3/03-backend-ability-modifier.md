# Task 03: Backend canonical abilityModifier
Depends on: none          Mode: Act

## Goal
Add one `abilityModifier` helper in the backend and replace the six inline copies.

## Context you need
- Backend: single quotes, trailing commas. Jest specs are colocated (`*.spec.ts`).
- Existing small shared helpers live in `dnd_vtt_backend/src/common/` (e.g. `arrays.ts`).
- Copies: `dnd_vtt_backend/src/companions/companion-rules.ts:68` (`const mod = (n: number) => Math.floor((n - 10) / 2);`, used ~5 times); `dnd_vtt_backend/src/companions/companions.service.ts` lines ~396, ~443, ~461; `dnd_vtt_backend/src/maps/maps.service.ts:954`; `dnd_vtt_backend/src/characters/characters.service.ts:577`.
- Keep the existing defaulting at each site (e.g. `?? 10`, `Number(... ?? 10)`); only the formula moves.

## Files
- Create: `dnd_vtt_backend/src/common/ability.ts` — `export function abilityModifier(score: number): number { return Math.floor((score - 10) / 2); }`
- Create: `dnd_vtt_backend/src/common/ability.spec.ts` — 10->0, 8->-1, 9->-1, 15->2, 1->-5, 20->5
- Edit: `companions/companion-rules.ts` — delete `mod`, import `abilityModifier` and use it
- Edit: `companions/companions.service.ts`, `maps/maps.service.ts`, `characters/characters.service.ts` — call the helper at the sites above

## Steps
1. Create helper + spec.
2. Replace each site; pass the same score expression, e.g. `abilityModifier(owner.ability_scores?.intelligence ?? 10)`.
3. `cd dnd_vtt_backend && npx prettier --write` on edited files.

## Done when
- [ ] `grep -rn "10) / 2" dnd_vtt_backend/src --include=*.ts` shows only `common/ability.ts` and spec files
- [ ] `cd dnd_vtt_backend && npm run build && npm test` pass

## Out of scope
- Other rules changes; frontend; the estimateAverageMaxHp logic beyond its modifier line.

## When finished
Tick the boxes above in this file and add a 2-line "Result:" note (what changed, anything odd).
