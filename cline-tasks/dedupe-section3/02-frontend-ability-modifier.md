# Task 02: Frontend ability modifier uses abilityModifier
Depends on: none          Mode: Act

## Goal
Remove the two inline `Math.floor((n - 10) / 2)` copies on the frontend in favour of the canonical `abilityModifier`.

## Context you need
- Canonical: `export function abilityModifier(score: number): number` in `dnd_vtt_frontend/src/app/core/models/character.model.ts` (~line 278).
- Copy 1: `dnd_vtt_frontend/src/app/shared/components/companion-sheet/companion-sheet.ts` ~line 128, method `modifier(n: number)` (used by its template, so keep the method but delegate).
- Copy 2: `dnd_vtt_frontend/src/app/features/create-content/content-detail-dialog/content-detail-dialog.ts` ~line 35 (`const value = Math.floor((score - 10) / 2);`).

## Files
- Edit: `dnd_vtt_frontend/src/app/shared/components/companion-sheet/companion-sheet.ts` — `modifier(n)` returns `abilityModifier(n)`; add import
- Edit: `dnd_vtt_frontend/src/app/features/create-content/content-detail-dialog/content-detail-dialog.ts` — use `abilityModifier(score)`; add import

## Steps
1. Read the lines around each copy.
2. Replace with the canonical call and add the import from the `core/models/character.model` relative path.
3. Run prettier on both files.

## Done when
- [ ] `grep -rn "10) / 2" dnd_vtt_frontend/src --include=*.ts` shows only `character.model.ts` (specs excluded)
- [ ] `cd dnd_vtt_frontend && npx ng build --configuration development` succeeds
- [ ] `cd dnd_vtt_frontend && npx ng test --watch=false` passes

## Out of scope
- Changing `abilityModifier`'s behaviour; templates; backend.

## When finished
Tick the boxes above in this file and add a 2-line "Result:" note (what changed, anything odd).
