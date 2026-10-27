# Task 07: Frontend/backend parity tests via shared fixtures
Depends on: 06          Mode: Plan first

## Goal
Add JSON fixtures at the repo root that BOTH the backend (Jest) and frontend (Vitest) specs read and assert against, covering token-border, avatar recipe, content-sources and average-HP. No shared package.

## Context you need
- Fixtures dir (new): `parity-fixtures/` at repo root; each file is `{ "cases": [ { "name", "input", "expected" } ] }`.
- Token border: backend `parseTokenBorder(value)` in `dnd_vtt_backend/src/common/token-border.ts:72`; frontend `normalizeTokenBorder(value)` in `dnd_vtt_frontend/src/app/core/utils/token-border.ts:85`. Both return `TokenBorder | null`.
- Avatar: backend `parseAvatarRecipe` in `dnd_vtt_backend/src/common/avatar-recipe.ts:48`; frontend `normalizeAvatarRecipe` in `dnd_vtt_frontend/src/app/core/utils/avatar.ts:96`. Both return recipe or null. Read both bodies first; where they legitimately differ, drop that case (note it in Result).
- Content sources: backend `normalizePlayerSources`, `disallowedSources` in `dnd_vtt_backend/src/content/content-sources.ts`; frontend `characterContentEnabled`/`campaignContentEnabled` in `dnd_vtt_frontend/src/app/core/utils/content-sources.ts` (uses `DndContentSource` objects: code, locked, player_options). Fixture supplies a `sources` list; backend side uses its own `CONTENT_SOURCES`, so only include codes present there (XPHB, EFA, XGE, TCE, XMM, HOMEBREW) and derive expected enabled/allowed from `locked`/`player_options` flags in that list.
- Average HP: backend `averageHp(level, hitDie, conMod)` in `dnd_vtt_backend/src/characters/average-hp.ts` (task 06); frontend `averageHpFormula(level, hitDie, conMod)` (perLevelBonus 0).
- Specs: backend colocated (`dnd_vtt_backend/src/common/parity.spec.ts`); frontend `dnd_vtt_frontend/src/app/core/utils/parity.spec.ts`. Read fixtures with `readFileSync` + `JSON.parse` from `node:fs` (backend: `join(process.cwd(), '..', 'parity-fixtures', ...)`; frontend: same; if `node:fs` is rejected by the Vitest/Angular build, fall back to a JSON import with `resolveJsonModule` and report it).
- Expected values must be hand-written in fixtures (not generated from either implementation); if the two sides disagree on a case, STOP, keep the case, mark the failing spec with `it.skip` plus a `// DIVERGENCE:` comment, and report it.

## Files
- Create: `parity-fixtures/token-border.json`, `avatar-recipe.json`, `content-sources.json`, `average-hp.json` (about 6 cases each, include invalid/null inputs)
- Create: `dnd_vtt_backend/src/common/parity.spec.ts`, `dnd_vtt_frontend/src/app/core/utils/parity.spec.ts`

## Steps
1. Read the four function pairs; write fixtures (valid, partial, out-of-range, garbage, null).
2. Write the backend spec iterating cases; then the frontend spec using the same files.
3. Run both suites; resolve fixture mistakes, report real divergences.

## Done when
- [ ] `cd dnd_vtt_backend && npm test -- common/parity` passes
- [ ] `cd dnd_vtt_frontend && npx ng test --watch=false` passes
- [ ] Result note lists any skipped divergence cases

## Out of scope
- Fixing divergences; spellcasting/spell-access and character-data shape parity; creating a shared package; canvas drawing code.

## When finished
Tick the boxes above in this file and add a 2-line "Result:" note (what changed, anything odd).
