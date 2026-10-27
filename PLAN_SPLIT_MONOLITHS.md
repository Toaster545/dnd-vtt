# Plan: Split the monolith files (MAINTAINABILITY_ISSUES.md #2)

## Context

Five files carry far more than one responsibility. Current sizes (the issues doc's numbers are
slightly stale; the backend two shrank after the typing work in `PLAN_TYPE_DOMAIN_OBJECTS.md`):

| File | Lines | What's in it |
|------|-------|--------------|
| `dnd_vtt_backend/src/characters/characters.service.ts` | 1712 | CRUD/drafts, level-up, spellcasting, items, pact weapon, rest, concentration, slot-pool maths |
| `dnd_vtt_backend/src/common/database.service.ts` | 1074 | Connection + 36 `applyVN()` migrations (~1000 lines of it) |
| `dnd_vtt_backend/src/maps/maps.service.ts` | 972 | Map CRUD, access checks, tokens, turn/plan/initiative, fog, lighting/walls |
| `dnd_vtt_frontend/.../battle-map/battle-map.ts` | 1214 | Tool state, panel layout, light/wall editing, map loading, Konva stage build + render orchestration |
| `dnd_vtt_frontend/.../character-play-sheet/character-play-sheet.ts` | 1561 (+980 html) | Every tab of the sheet: stats, spells, inventory, currency, actions, rests, companions, avatar edit |

**Goal:** no file over roughly 600 lines, each with one reason to change. **This is a pure refactor.**
No behaviour changes, no renames of public API, no schema changes. Code is moved verbatim and
re-wired, not rewritten.

### Things already in our favour

- `common/character-lock.ts` already exports `withCharacterLock`, so the per-character lock is
  shared and doesn't need to be untangled.
- `InventoryService` (814 lines) and `inventory-rules.ts` were already extracted from characters.
- `battle-map/canvas/` already holds 15 extracted renderers/tools (~1.8k lines) and
  `battle-map/components/` holds the panels. The frontend map split is *finishing* a job, not starting one.
- `characters.service.spec.ts` (967 lines) is a real safety net for the characters split.

### Constraints / risks

- **`CharactersService` is constructed by hand in its spec** (`new CharactersService(db, ...)`,
  `characters.service.spec.ts:46`) and has `@Optional()` deps (`companions`, `inventory`). Keep the
  optionality in any extracted service the spec builds directly.
- **Maps has thin tests** (`movement.spec.ts`, `player-tokens.spec.ts` only) and **battle-map.ts has
  none**. Characterization tests come *before* moving code there.
- **Migrations are historical.** Their SQL must not change. Moving them is safe only if the
  resulting schema is byte-identical (verified below).
- Circular dependencies: extracted services must depend on a shared lower layer, never on each
  other in a cycle (see "Shared base" below).

## Principles

1. One extraction per PR. Tests green before and after. No drive-by fixes in the same PR.
2. **Facade first.** The original class keeps its public methods and delegates to the new service.
   Controllers, other modules and the existing spec keep working unchanged. Only after a domain is
   fully extracted do we (optionally) point the controller at the new service directly and delete
   the delegating stubs.
3. Move code **verbatim**; diff review should show moves, not edits.
4. Extract the lowest-coupling, most self-contained group first; leave shared plumbing for last
   *or* extract it first as a dependency-free base (below), never half-way.
5. Register each new provider in its module (`characters.module.ts`, `maps.module.ts`, ...).

## Phase 1 — `characters.service.ts` (highest value, best safety net)

### 1a. Shared base: `CharacterRepository`

Extract the plumbing every other group needs, with no domain logic, so the new services depend on
it instead of on each other:

- `findOne`, `findOneReadable`, `isCampaignOwner`, `hasEditAccess`, `deserialize`,
  `normalizeCharacterSources`, `normalizeCharacterAvatar`, `characterData`, `writeCharacterData`,
  `notifyUpdated`, `requiredString`, `assertCampaignSources`, `isCharacterInActiveEncounter`.
- Constants it owns: `CHARACTER_COLUMN_KEYS`.

### 1b. Domain services (extract in this order)

| Order | New service | Methods moving (approx. lines) | Notes |
|-------|-------------|-------------------------------|-------|
| 1 | `CharacterRestService` | `completeRest`, `restoreLife` (~90) | Smallest, self-contained: good first PR to prove the pattern |
| 2 | `CharacterLevelUpService` | `applyLevelUp`, `levelUpBaseline`, `estimateAverageMaxHp` (~100) | Depends on `ContentService` + repository |
| 3 | `PactWeaponService` | `updatePactWeapon`, `hasPactOfTheBlade` (~95) | |
| 4 | `CharacterItemsService` | `grantItem`, `revokeItem`, `replicateItem`, `inventoryOptions`, `inventoryOperation` (~250) | Thin layer over the existing `InventoryService`; consider merging into it instead if the overlap is large |
| 5 | `CharacterSpellcastingService` | `castSpell` (~155), `grantSpell`, `revokeSpell`, `restoreSpellcasting`, `endConcentration`, `resolveSlotPools` (~110), `resolveDragonmarkSlotPool` (~95), `numberRecord`, `recordOfRecords`, `freeCastRecord` (~600 total) | Largest group. `resolveSlotPools` is pure logic: pull it (plus the dragonmark pool) into a plain function module `spell-slot-pools.ts` first so it is unit-testable without a DB |

What stays in `CharactersService`: list/find, `create`, drafts, `update`/`updateUnlocked`,
`updatePlayerEditableFields`, `remove`, `uploadPortrait` (~450 lines), delegating the extracted
methods until the controller is repointed.

### 1c. Wrap-up

- Repoint `characters.controller.ts` (25 routes) at the specific services; delete the delegating
  stubs. Update `characters.service.spec.ts` by splitting it alongside the code
  (`rest.service.spec.ts`, `spellcasting.service.spec.ts`, ...).
- Check external consumers still compile: `companions.controller.ts`, `campaigns.service.ts`,
  `common/portrait-image.ts`, `content.service.ts` reference characters code.

## Phase 2 — `maps.service.ts`

**First:** add characterization tests for the paths about to move (token upsert/move/delete, plan
confirm/undo, fog paint, lighting walls, player-state serialization). Current coverage is
`movement.spec.ts` and `player-tokens.spec.ts` only.

| Order | New service | Methods moving |
|-------|-------------|----------------|
| 1 | `MapAccessService` (shared base) | `assertCampaignAccess`, `isCampaignDm`, `assertMapAccess`, `resolveMapReadAccess`, `findOneRaw`, `assertOwnTokenOrDm` |
| 2 | `MapFogService` | `getFogRaw`, `getFog`, `setFogEnabled`, `paintFog`, `resetFog`, `upsertFog`, `broadcastFog` |
| 3 | `MapLightingService` | `getLightingRaw`, `getLighting`, `setLightingEnabled`, `setAmbientLight`, `setWalls`, `upsertLight`, `deleteLight`, `deserializeLight`, `parseWalls`, `upsertMapLighting`, `broadcastLighting` |
| 4 | `TokenTurnService` | `getTokenPlan`, `setTokenPlan`, `planOf`, `confirmTokenMove`, `undoTokenMove`, `findTurnToken`, `rerollInitiative`, `rollMonsterInitiative` |
| 5 | `MapTokensService` | `getTokens`, `getTokensRaw`, `upsertToken` (~125 lines, the biggest single method: consider breaking it up *after* the move), `deleteToken`, `moveTokenToMap`, `setTokenColor`, `findCharacterToken`, `relocateCharacterToken`, `findTokenRaw` |

`MapsService` keeps map CRUD, image upload/serve and `getPlayerState` (~250 lines). All of these
broadcast through `TokensGateway`, so the gateway dependency is shared; make sure the new services
don't create a `TokensGateway` ↔ service cycle.

## Phase 3 — `database.service.ts` (mechanical, low risk)

Split along the real seam: connection vs. migration history.

- Create `common/migrations/` with **one file per version** (`v001-initial.ts` ... `v036-*.ts`), each
  exporting `{ version: number; description: string; up(db): Promise<void> }`, plus an
  `index.ts` exporting the ordered array.
- `runMigrations()` becomes a loop over that array (`if (version < m.version) await m.up(...)`),
  replacing the ladder of 36 `if (version < N)` lines.
- `DatabaseService` keeps `onModuleInit`, `execute`, `executeMany`, `parseJson`, backup, `close`
  (~150 lines).
- **Preserve exactly:** each migration's SQL and where it stamps `PRAGMA user_version`. The file
  has odd stamps worth checking rather than "tidying": there is no `applyV22` (versions go 21 → 23),
  and statements near `database.service.ts:166` and `:189` write `user_version = 35` / `34` from
  inside other migrations. Re-read each before moving it.
- This overlaps issue #3 (migrations table, rollback). Do **only** the file split here; changing
  how versions are tracked is a separate decision.

## Phase 4 — `character-play-sheet.ts` (frontend)

The sheet is one component with a `Tab` type (`goToTab`, `swipeTab`) and no child components. Split
by tab into standalone child components, sharing state through a component-scoped store.

1. **`CharacterSheetStore`** (provided on the play-sheet component, not root): owns `localChar`,
   derived stats, `load`, `persist`, `computeArmorClass`. Children inject it instead of using
   `@Input`/`@Output` plumbing for everything.
2. Child components, extracted one tab at a time, **moving the matching HTML block and methods together**:
   - Spells tab: slot pips/levels, filters, cast dialog, concentration, `performCast`,
     `rollSpellEffect`, granted-spell dialog (the largest cluster, ~lines 1311-1561 plus the
     spell HTML).
   - Inventory tab: item expansion, grant/revoke item dialog, currency adjust, pact weapon.
   - Actions/combat: `useAction`, `restoreAction`, HP adjust/colour, heroic inspiration.
   - Features/traits: `describeGrant`, `describeChoicePicks`, `grantsOrLegacy`.
   - Header: portrait change, name edit, rest buttons.
3. Pure helpers that don't touch signals (`fmt`, `slotLevels`, `spellDamageFormula`,
   `descriptionSegments`, ...) move to `core/utils/` where `spellcasting.ts` and
   `character-effects.ts` already live, and get unit tests.
4. Target: parent component keeps layout, tab switching, swipe/scroll handlers only.

Do before starting: read the file's signals/effects and confirm which tabs are truly independent
(`inventorySaved`, `companionChanged` suggest some nested components already exist).

## Phase 5 — `battle-map.ts` (frontend)

Finish the extraction already underway in `battle-map/canvas/`.

1. **Characterization first**: no tests exist. Extract the pure logic first
   (`darkvisionLights`, `tokensHiddenByDarkness`, wall commit/flush) into `canvas/` with unit tests
   (`visibility.spec.ts` is the model). Write a short manual QA checklist for what can't be unit
   tested (see Verification).
2. Extract **tool state** (`toggleMeasureTool`, `toggleFogTool`, `toggleLightTool`,
   `togglePickDestination`, `selectPointerTool`, new-light radius) into a component-scoped
   `BattleMapToolState` service.
3. Extract **light and wall editing** (`selectLight`, `updateSelectedLight`, `moveLight`,
   `removeLight`, `placeLight`, `commitWalls`, `flushWalls`, `clearWalls`, ambient commit/flush)
   into `LightEditingController` / use the existing `wall-tool.ts`.
4. Extract **panel layout** (`onRightAsideResize`, `onTurnColResize`, `onSheetResize`, column
   toggles, fullscreen) into a small layout service or directive. This is unrelated to Konva.
5. Move `buildStage` (~170 lines of event wiring) into `canvas/stage-builder.ts` alongside
   `stage-view.ts`.
6. `battle-map.ts` is left with lifecycle, map loading and render orchestration (target < 500 lines).

## Order and effort

| Phase | Effort | Risk | Why this order |
|-------|--------|------|----------------|
| 1 characters.service | High (5-6 PRs) | Low-Med | Biggest pain, existing 967-line spec |
| 3 database.service | Low (1-2 PRs) | Low | Mechanical; can be done any time, even first as a warm-up |
| 2 maps.service | Med-High | Med | Needs new tests first |
| 4 play-sheet | High | Med | UI, no E2E; HTML and TS must move together |
| 5 battle-map | High | High | Canvas, no tests, hard to verify automatically |

Suggested start: Phase 3 (quick win) and Phase 1a-1b step 1 (`CharacterRestService`) to prove the
pattern before the large ones.

## Verification (every PR)

Backend:
1. `cd dnd_vtt_backend && npx tsc --noEmit -p tsconfig.json`: no new errors (baseline: spec-file
   errors only; record the count first).
2. `npm test`: all green with **no test edits** in a facade-only PR; test edits only in the
   PR that repoints the controller/spec.
3. `npm run lint`.
4. Boot with `npm run start:dev` and hit the moved endpoints (curl with the `dev` bearer token).
5. Migrations (Phase 3): build a fresh DB and a copy of a real older DB with the old and new code,
   then compare `SELECT type, name, sql FROM sqlite_schema ORDER BY name` and `PRAGMA user_version`.
   They must be identical.

Frontend:
1. `ng build` and `ng test` pass.
2. Play sheet: for each tab, create/open a character, cast a concentration spell and replace it, short and long rest,
   grant/revoke an item and a spell as DM, adjust HP and currency, edit name/portrait, open as a locked player.
3. Battle map: add/move/delete a token, measure, paint and reset fog, place/move/remove a light and
   draw walls, set a plan marker and confirm/undo a move, resize panels. Check both DM and
   player views and a two-browser socket sync.

## Out of scope

- Behaviour changes or bug fixes found along the way (log them, fix in separate PRs).
- The migrations table / rollback design (issue #3) and typed-domain work (issue #1, already planned).
- Splitting `content.service.ts`, `campaigns.service.ts` and other mid-size files; revisit after
  the five above.
