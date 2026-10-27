# Codebase Inconsistencies

Audit of places where the codebase does the same thing in more than one way, or where docs/config
disagree with the code. Each item is something that will cost a future contributor time. This is
about **consistency**, not features or bugs.

Findings were checked against the tree on branch `code-refactor` (commit `a0d549b`). Counts are from
grep/prettier runs at that point and will drift.


## Priority summary

| # | Area | Impact | Effort |
|---|------|--------|--------|
| 1.1 | Controllers: DTOs vs `Record<string, unknown>` bodies | Validation silently skipped on ~22 endpoints | Medium |
| 1.2 | `ConfigModule` installed but `process.env` read directly; CORS list duplicated 3× | Config drift | Low |
| 1.3 | SQL scattered across services; repository only for characters | Hard to change schema safely | High |
| 2.1 | Frontend not Prettier-formatted (178 files) while backend is clean | Noisy diffs | Low |
| 3.1 | Same helpers copied in many places (`toContentIndex` ×5, ability-mod ×9) | Bug fixed in one copy only | Low |
| 3.2 | Rules duplicated across frontend/backend by hand ("mirrors …" comments) | Silent divergence | Medium |
| 4.1 | `CLAUDE.md` describes a migration system that no longer exists | Misleads humans and Claude | Low |
| 5.1 | Dead code: Open5e/Dnd5e services, `adminGuard`, Nest scaffold `Hello World` | Confusion | Low |
| 5.2 | Stray binaries and scratch files committed | Repo hygiene | Low |
| 6.1 | Content JSON mixes `snake_case` and `camelCase` keys, even within one file | Authoring errors | Medium |

---

## 1. Backend

### 1.1 Request bodies: DTOs for some endpoints, raw `Record<string, unknown>` for others

The app registers a global `ValidationPipe({ whitelist: true, transform: true })`
(`dnd_vtt_backend/src/main.ts:31`). That only does anything for parameters typed as a
`class-validator` DTO class. Parameters typed `Record<string, unknown>` or an inline type literal
skip validation and whitelisting entirely.

Current state of `@Body()` parameter types across controllers:

- DTO classes: ~33 endpoints (campaigns, sessions, wiki, auth, users, content create/update, encounters create).
- `Record<string, unknown>`: **22 endpoints**, of which **all of `characters.controller.ts`** (19
  endpoints, no DTO anywhere), plus `maps.controller.ts` (3), `encounters.controller.ts` (1),
  `companions.controller.ts` (2).
- Inline literal types (`{ visible: boolean }`, `{ x: number; y: number }`, `{ walls: unknown }`, …): ~10
  endpoints in `maps.controller.ts` and elsewhere. These look typed but are not validated at runtime.

So the *same* service layer has hand-written `typeof body.x === 'string'` checks in one place and
declarative validators in another, and a reader cannot tell from a controller which kind of
endpoint they are looking at.

**Status: fixed.** Every mutating endpoint above now has a DTO (`maps/dto/`, `characters/dto/`,
`companions/dto/`, `encounters/dto/update-encounter.dto.ts`, `common/set-visible.dto.ts`, …). The
character create/update/draft/level-up bodies are an open-ended JSON blob, so they use
`ValidateOnlyPipe` (`common/validate-only.pipe.ts`): typed fields are checked, undeclared keys pass
through (a plain DTO would have them stripped by `whitelist: true`). Tests in
`common/request-validation.spec.ts`.

**Original suggestion:** pick DTOs as the rule. Convert character/map/companion endpoints incrementally;
start with the ones that mutate (`PUT`/`PATCH`/`POST`). Inline literal types should become DTOs too,
since they give a false sense of safety.

### 1.2 Configuration: `ConfigModule` is loaded but unused; env access is scattered

- `app.module.ts:17` registers `ConfigModule.forRoot({ isGlobal: true })`, but nothing injects
  `ConfigService`. Everything reads `process.env.*` directly (`main.ts`, `database.service.ts`,
  `migrations/v035.ts`, `tokens.gateway.ts`, `encounter-presence.gateway.ts`, `jwt.guard.ts`,
  `socket-auth.service.ts`, `auth.controller.ts`, `jwt-secret.ts`).
- **The CORS default list is copy-pasted three times** — `main.ts:24`, `maps/tokens.gateway.ts:29`,
  `encounters/encounter-presence.gateway.ts:39` — including the production hostname. Adding an origin
  means editing three files and forgetting one breaks only websockets (or only REST).
- `DEV_BYPASS === 'true'` is checked independently in `main.ts` (twice), `jwt.guard.ts` and
  `socket-auth.service.ts`. `jwt-secret.ts` has its own `isDevRun()` with a *different* definition of
  "dev" (`DEV_BYPASS` **or** `NODE_ENV=development|test`). Three notions of "are we in dev" exist.
- `DB_PATH` is defaulted in two places with the same literal (`database.service.ts:14`,
  `migrations/v035.ts:27`).

**Suggestion:** one `config.ts` (or `ConfigService` with a validated schema) exporting `corsOrigins`,
`isDevBypass`, `dbPath`, `jwtSecret`. Gateways and `main.ts` import from it.

**Status: fixed.** `src/config.ts` exports `corsOptions()`, `isDevBypass()`, `isDevRun()`, `dbPath()`,
`isProduction()`; `main.ts`, both gateways, `jwt.guard`, `socket-auth`, `auth.controller`,
`database.service`, `v035` and `jwt-secret` use it. The two notions of "dev" are kept (they have
different jobs) but are now named and documented side by side. `ConfigModule` stays because it is
what loads `.env`; env reads are lazy functions because of that load order.

### 1.3 Data access: one repository, everything else inline SQL

`characters/character-repository.ts` is a real repository (`findOne`, `deserialize`, access checks).
No other domain has one. Raw SQL strings live directly in services *and* in gateways and guards:

| File | SQL statements |
|------|---------------:|
| `maps/maps.service.ts` | 52 |
| `encounters/encounters.service.ts` | 52 |
| `campaigns/campaigns.service.ts` | 40 |
| `wiki/wiki.service.ts` | 34 |
| `companions/companions.service.ts` | 15 |
| `characters/inventory.service.ts` | 13 |
| `maps/tokens.gateway.ts`, `encounters/encounter-presence.gateway.ts`, `auth/jwt.guard.ts`, `auth/socket-auth.service.ts` | 15 combined |

The gateways re-implement membership/visibility checks with their own SQL
(`tokens.gateway.ts:174-193`, `encounter-presence.gateway.ts:114,255-268`) rather than calling the
services that own that rule. Authorisation logic therefore exists in two places per feature.

Row mapping is also per-service and ad hoc: `campaigns.service.ts` `deserialize()`,
`encounters.service.ts` `deserialize()`, `maps.service.ts` `deserializeLight()`, and the
repository's async `deserialize()` for characters all do different things (some are sync, one is
async, one folds a JSON `data` blob back in, others don't).

**Status: partly fixed.** Membership/visibility rules (gateway `mapRole`, `assertEncounterAccess`,
`MapsService.resolveMapReadAccess`, `EncountersService.assertActiveMember`) now live in
`campaigns/campaign-access.service.ts`, with tests. **Not done:** a repository layer for
maps/campaigns/encounters/wiki/companions/inventory (~190 SQL statements in services), the
per-service `deserialize*` row mappers, the remaining non-authorisation SQL in the gateways
(room fan-out lookups, `announce_presence` character fetch) and the duplicated profile/dev-admin
lookup in `jwt.guard` and `socket-auth`. That is a large refactor of untested code (`maps.service`
has no spec) and should be done per domain with tests first.

### 1.4 Error handling in gateways differs from controllers

Controllers/services consistently throw Nest `HttpException` subclasses (≈255 uses). The two gateways
throw bare `new Error('Forbidden')` / `new Error('Map not found')`
(`tokens.gateway.ts:174,193`, `encounter-presence.gateway.ts:114,255,268`). Over websockets these do
not become structured errors the client can distinguish (no `WsException`), and `'Forbidden'` as a
plain `Error` message reads like an HTTP status but isn't one.

**Status: fixed.** Gateway failures throw `WsException` via `wsGuard` (`common/ws-guard.ts`), which
maps 403/404 to `{ status, message }`.

### 1.5 Guard placement is inconsistent

- Most controllers use a class-level `@UseGuards(JwtGuard)`.
- `content.controller.ts` repeats `@UseGuards(JwtGuard)` on ~19 individual methods and leaves other
  `GET`s (`getMonster`, `getFeat`, …) unguarded. Some of that is intentional (public SRD reads), but
  nothing says which. A new route added to that file defaults to *public*, the opposite of every
  other controller.
- Role checks happen in three styles: `AdminGuard` (`users.controller.ts`), inline
  `user.role !== 'admin'` (`maps.service.ts:834,852`), and ownership checks (`campaign.dm_id`) in
  services. `sessions`/`encounters`/`campaigns` controllers carry comments explaining "no
  AdminGuard", which is good, but the rule isn't stated anywhere central (see 4.2).

**Status: fixed.** `ContentController` is guarded at class level; the static reads are explicit
`@Public()` (`auth/public.decorator.ts`, honoured by `JwtGuard`). The three authorisation styles
are documented on `AdminGuard`.

### 1.6 Naming of directories and files under `src/content/`

`src/content/class_content/` and `src/content/spell_content/` use `snake_case`; every other
directory in `src/` is a single lowercase word or kebab-case file names. They also only contain
`*.spec.ts` files (plus a test util), i.e. they are content tests not content code, but live
alongside `content.service.ts`. Other specs are colocated with the file they test.

**Status: fixed.** `class_content/` and `spell_content/` renamed to `class-content/` and
`spell-content/` (they stay in `src/` so the unit runner picks them up).

### 1.7 Test-layout and runner differences

- Backend: Jest, specs colocated (`*.spec.ts`), plus a `test/` directory with `app.e2e-spec.ts` that
  still asserts the Nest scaffold (`GET / → "Hello World!"`) against `AppController`/`AppService`
  (both are unmodified scaffold). That e2e test is not run in CI (`ci.yml` runs only `npm test`).
- Frontend: Vitest via `ng test` for unit tests and Playwright for e2e (`e2e/`).
- Nine backend services have no spec: `maps.service` (972 lines), `content.service` (623),
  `wiki.service` (525), `sessions`, `users`, `player`, `socket-auth`, `character-rest`,
  `database.service`.

**Status: mostly fixed.** The scaffold `AppController`/`AppService` and their stale e2e test are
deleted; `test/app.e2e-spec.ts` now boots the real `AppModule` and checks guard-by-default and the
public content routes; CI runs `npm run test:e2e`; `npm run lint:check` is the non-mutating lint.
New specs: `users`, `sessions`, `socket-auth`, `database` and `campaign-access` services,
`ws-guard`. **Still without a spec:** `maps.service`, `content.service`, `wiki.service`,
`player.service`, `character-rest.service`.

---

## 2. Frontend

### 2.1 Prettier is enforced on the backend but not the frontend

`npx prettier --check "src/**/*.{ts,html,scss}"` in `dnd_vtt_frontend`: **178 files fail**. The same
check in `dnd_vtt_backend`: **all pass**. `.prettierrc` says 100-column width, but 751 lines in
frontend `.ts` files exceed 100 characters; e.g. one-liners such as
`core/services/player-context.service.ts:29-31` and `shared/components/magic-inventory/magic-inventory.ts:54-66`.
Neither CI workflow runs a format check, and `package.json` has no `format` script in the frontend
(the backend has one). The first contributor who runs "format on save" will produce a 178-file diff.

**Suggestion:** run `prettier --write` once as its own commit, add a `format:check` step to CI, add
the commit to `.git-blame-ignore-revs`.

### 2.2 Component file naming

46 `@Component` classes, all named `*Component`, but their **file** names are split:

- 4 files in `features/wiki/` use the `*.component.ts` suffix (`wiki.component.ts`,
  `wiki-workspace.component.ts`, …).
- Everything else omits it (`battle-map.ts`, `character-play-sheet.ts`, `dashboard.ts`, `login.ts`).

The newer Angular style guide drops the suffix, so the wiki folder is the outlier. Within the
no-suffix group there is a further inconsistency: routed pages are sometimes `*-page.ts`
(`character-wizard-page.ts`, `character-sheet-page.ts`, `character-level-up-page.ts`) and sometimes
not (`characters.ts`, `campaigns.ts`, `battle-map.ts`). `characters/characters.ts` and
`campaigns/campaigns.ts` are the list pages; it is not obvious from the name.

### 2.3 Templates and styles: external vs inline

60 components use `templateUrl`; **12** use inline `template:` (small dialogs, `app.ts`,
`features/wiki/*`, `character-notes.ts`, …). Only 7 files have a stylesheet (`styleUrl`), the rest
rely on Tailwind classes in the template. Inline templates are fine for tiny components, but there is
no stated threshold, and some are not tiny.

### 2.4 Subscription lifecycle and async style

- `.subscribe(` appears 29 times; 19 files use `takeUntilDestroyed`/`DestroyRef`/`ngOnDestroy`.
  Four files subscribe without any visible teardown: `shared/components/companion-sheet/companion-sheet.ts`,
  `core/services/background.service.ts`, `core/services/pwa.service.ts`,
  `features/characters/character-play-sheet/character-play-sheet.ts`. (Services that live for the app's
  lifetime are fine; the two components are worth a look.)
- `firstValueFrom` is used 145 times (promise style) while `.subscribe` is still used in 29 places and
  `toSignal` / `rxResource` in a handful. Three async idioms coexist with no guideline.
- Raw `fetch()` is used in `content.service.ts:512`, `auth-token.service.ts:60`, `dnd5e.service.ts:82`
  and `encounter-form-dialog.ts:588`, bypassing `HttpClient` and therefore the `auth.interceptor`
  (the auth-token one is deliberate to avoid a refresh loop; the others are not documented as such).
- `HttpClient` is injected directly in a component, `shared/avatar-creator-dialog/avatar-creator-dialog.ts`,
  whereas the other 14 users are in `core/services`.

### 2.5 Error messages: helper exists, used inconsistently

`core/utils/error-message.ts` (`getErrorMessage`) is used 24 times, yet 18 sites read
`err.error?.message` / `error?.error` by hand (create-content forms, `character-wizard.ts`,
`character-play-sheet.ts`, campaign hubs, …). There is one HTTP interceptor (`auth.interceptor.ts`)
and no global error surface; each component decides how to show failures, and `catchError` appears
in only one file.

### 2.6 `localStorage` key naming

20+ distinct keys with three naming styles: `UPPER_CONST` without prefix, dotted
(`character.active-draft-id`), and colon-scoped (`wiki:collapsed:${campaignId}`). The same literal
`'character.active-draft-id'` / `'character.active-draft-step'` is hard-coded in
`character-wizard-page.ts:32,42-43` **and** held as constants in `character-wizard.ts`
(`ACTIVE_DRAFT_KEY`, `ACTIVE_DRAFT_STEP_KEY`) — change one and the other silently stops matching.
Two features each implement the same "sidebar width persisted in localStorage" logic
(`hub-view.service.ts:32-40` and `wiki-workspace.component.ts:56-65`).

### 2.7 Models: snake_case and camelCase side by side in the same interface

API payloads from the backend are mostly `snake_case` (`dm_id`, `join_code`, `created_at`,
`current_session_id`) and the frontend models mirror them. But newer fields are camelCase, sometimes
in the same interface: `core/models/character.model.ts` has ~47 snake_case and ~19 camelCase members
(`instanceId`, `itemIndex`, `spellIndex`, `sourceKey`, `chargesUsed`, `startedAt`, …).
`campaign.model.ts` is 74/7, `encounter.model.ts` 22/12. The backend does the same in its response
objects (21 snake vs 48 camel matches in service return literals). There is no rule for which one new
fields should use, so each author picks one. Any generic mapper (or a shared type) is impossible
while this stands.

### 2.8 `shared/` structure

`shared/` mixes organisation schemes: `confirm-dialog/` (a dialog folder) and `confirm.service.ts`
sit at the root; `avatar-creator-dialog/` is at the root while the similar `description-dialog/` and
`content-source-dialog/` are under `shared/components/`. `features/player-view/` is a feature with
`player-view.ts` but sits beside `features/player/` (which holds the player *campaign* screens).

---

## 3. Duplication across the codebase

### 3.1 Copy-pasted helpers

| Helper | Copies |
|--------|--------|
| `toContentIndex(name)` | 5 identical private copies in `dm-campaign-session.ts`, `dm-campaign-hub.ts`, `dashboard.ts`, `player-campaign-session.ts`, `player-view.ts` |
| `toIndex(name)` | same logic, different name, in `character-play-sheet.ts:57` |
| Ability modifier `Math.floor((n - 10) / 2)` | 9 inline copies: `character.model.ts:231` (the canonical `abilityModifier`), `companion-sheet.ts:70`, `content-detail-dialog.ts:30`, and 6 in the backend (`companion-rules.ts`, `companions.service.ts` ×3, `maps.service.ts:965`, `characters.service.ts:577`) |
| `itemDisplayName` | frontend `content.service.ts:396` and backend `characters.service.ts:34` (backend version is typed `Record<string, unknown>`) |
| JSON parse + fallback | `DatabaseService.parseJson`, also re-exposed on `MigrationContext`, plus ad hoc `JSON.parse(...)` sites in services |

### 3.2 Game rules implemented twice (frontend and backend) by hand

There is no shared package, so rules are mirrored with "// Mirrors X in the frontend" comments. This
is the highest-risk kind of duplication because divergence is silent:

- `token-border` — backend `common/token-border.ts` (111 lines) and frontend `core/utils/token-border.ts`
  (449 lines) + `token-border.model.ts` (comment: "Mirrors the backend's…").
- Avatar recipe — backend `common/avatar-recipe.ts` (`parseAvatarRecipe`) vs frontend
  `core/utils/avatar.ts` (`normalizeAvatarRecipe`): same concept, different function names.
- `content-sources` — backend `content/content-sources.ts` (146 lines) vs frontend
  `core/utils/content-sources.ts` (38 lines).
- Average-HP formula: `characters.service.ts:560` mirrors `averageHpFormula` in `character-effects.ts`.
- Character data shape: `characters/character-data.ts` says it mirrors the frontend model.
- Also `core/utils/spellcasting.ts` (1538 lines, frontend) vs `spell-access.ts` (backend).

**Suggestion:** at minimum, a test that feeds the same fixtures to both implementations; better, a
small shared `packages/rules` workspace for the pure functions.

---

## 4. Docs and config that disagree with the code

### 4.1 `CLAUDE.md` describes an obsolete migration system

`CLAUDE.md` says migrations are `applyV1()` / `applyV2()` methods in `DatabaseService` and that
"schema changes are added as a new `applyVN()` method plus a version bump". That was refactored:
`database.service.ts` is now 71 lines and migrations live in `src/common/migrations/vNNN.ts`, each
exporting a `Migration` object registered in `migrations/index.ts`. The doc also:

- lists 8 modules (`auth, characters, content, maps, sessions, encounters, campaigns, notes`).
  There is **no `notes` module**; the real list also has `wiki`, `companions`, `users`, `player`,
  `backgrounds`.
- lists `core/utils` and `core/services` contents that are missing newer entries (`wiki`,
  `companion`, `hub-view`, `player-context`, `pwa`, …) and describes `Open5eService`/`Dnd5eService`
  as a live data path (they are dead, see 5.1).
- lists backend commands without `start:prod` (which root `npm start` calls); its `npm run start`
  entry is a different, non-production mode.

Because CLAUDE.md is loaded into every AI-assisted session, stale instructions here compound.

**Status: fixed.** CLAUDE.md now describes `migrations/vNNN.ts`, the real module list, `start:prod`/`lint:check`, current frontend services/models, and no longer mentions the removed Open5e/Dnd5e services or `adminGuard`.

### 4.2 Migration conventions are implicit

- Versions are 1–36 with **no v22** (`index.ts` comment: "There is deliberately no v22; see v023"). The
  gap is explained in `v023.ts`, but nothing stops someone adding `v022.ts` later and having it
  silently ordered wrong.
- The `Migration` interface says "each migration stamps `PRAGMA user_version` itself". The runner
  does *not* verify this, so a migration that forgets to stamp would re-run on every boot. The loop
  also runs migrations in array order while skipping on `version < migration.version`, so the array
  order and the `version` field can silently disagree.
- `v035.ts` reads item JSON from disk at migration time, tying a historical migration to the current
  state of `content/items/`. Re-running it on a fresh DB after items are renamed would produce
  different results than it did originally.
- Pre-versioning detection (`version === 0 && table profiles exists → 1`) is hard-coded in the runner
  and is not documented anywhere else.

**Status: mostly fixed.** The runner now throws if a migration does not stamp `PRAGMA user_version` to its own version, and `assertMigrationsOrdered()` (`migrations/migration.ts`) rejects a registry that is out of order or duplicated (the v22 gap stays allowed; CLAUDE.md says never to add it). Pre-versioning detection is commented in the runner. **Not done:** v035 still reads `content/items/` at migration time (changing a shipped migration is riskier than documenting it; noted in CLAUDE.md).

### 4.3 Version/skew statements

- `CLAUDE.md`, `README.md` and `docs/mobile/implementation-audit.md` all say "Angular 22". The
  project memory index still says Angular 18 (outdated memory, not repo, but worth reconciling).
- Backend uses TypeScript `^5.7` and frontend `~6.0`; Jest in the backend vs Vitest in the frontend.
  Not wrong, but two toolchains for one team.
- Root `.gitignore` lists `/package-lock.json`, but the root has a `package-lock.json` file on disk
  (untracked), while the two sub-projects commit theirs. Pick one.

**Status: not changed.** The root lockfile is gitignored on purpose (root only holds dev scripts); it is simply a local file. Angular 22 is correct in the repo; the memory index is outside the repo.

### 4.4 Several sources of "what's planned"

`TODO.md` (checklist with personal headings), `PLAN_SPLIT_MONOLITHS.md`, `MAINTAINABILITY_ISSUES.md`,
`docs/mobile/*.md`, and `dnd_vtt_backend/content/AUDIT.md` + `content/plans/` all describe work in
progress, in different formats, with no index. `TODO.md` contains an empty `- [ ] ` bullet and
items checked off twice ("Showing feat ability score improvements…" appears in both Bugs and General).

**Status: partly fixed.** The empty bullets and the duplicated checked item were removed from `TODO.md`. Still no single index of planned work.

---

## 5. Dead code and repo hygiene

### 5.1 Unused code

- `core/services/open5e.service.ts` (60 lines) and `core/services/dnd5e.service.ts` (110 lines):
  not referenced from any component or service. All content now comes from the backend. `dnd5e.service`
  makes a bare `fetch()` to an external API that would be a surprise if it were ever wired up.
- `core/guards/admin.guard.ts` (frontend): not used in `app.routes.ts` (the only mention is a
  comment in `settings-dialog.ts`). `CLAUDE.md` still lists `adminGuard`.
- `AppController` / `AppService` in the backend are the unmodified Nest scaffold ("Hello World!").
  In the real app `main.ts` serves `index.html` for `/` before Nest routing runs, so the controller
  is unreachable. `test/app.e2e-spec.ts` only passes because it boots `AppModule` without `main.ts`;
  it tests behaviour the deployed app does not have.

**Status: fixed.** `open5e.service.ts`, `dnd5e.service.ts` and the frontend `admin.guard.ts` are deleted (and references in `README.md` / `settings-dialog.ts` removed); the backend scaffold went with 1.7.

### 5.2 Files that should not be in version control

Tracked at the repo root or in the frontend:

- `libasound2t64_1.2.11-1ubuntu0.3_amd64.deb` — a system package installer.
- `dnd_vtt_frontend/test-results/e2e-mobile-layout.db` and `.last-run.json` — Playwright output.
  `dnd_vtt_frontend/.gitignore` already lists `/test-results/`, so these were committed before the
  ignore rule (or force-added) and need a `git rm --cached`.
- `dnd_vtt_frontend/probe.cjs` — scratch script at project root.
- `campaign-rewards-import.json` — data file at the repo root, not referenced by any code or script.

Additionally, `custom-avatar-assets.generated.ts` / `*-manifest.generated.ts` are generated by
`avatar-assets/compile.mjs` and committed. That is a defensible choice, but there is no check (CI or
pre-commit) that they are up to date with `avatar-assets/packs/`.

**Status: fixed.** The five stray files are untracked (`git rm --cached`; `probe.cjs` deleted) and ignored via `.gitignore` (`*.deb`, `probe.cjs`; `test-results/` was already ignored in the frontend). `campaign-rewards-import.json` is **left in place** because it may be data you still want: delete it if not. CI now rebuilds the avatar manifests and fails on a `*.generated.ts` diff.

### 5.3 CI covers some things, not others

`ci.yml` runs backend tests/build/lint, frontend lint/tests/build, and Playwright. It does not run
backend e2e (`test:e2e`), a Prettier check, or `npm run avatars:test`. Note also the CI comment that
`npm run lint` in the backend uses `eslint --fix` — so a developer running `npm run lint` locally
mutates files while CI uses a different (non-fixing) command; the two scripts are not equivalent.

**Status: fixed.** CI runs backend e2e, the frontend `format:check`, and now `avatars:test` plus the generated-files check. The backend has `lint:check` for the non-mutating variant.

---

## 6. Static content (`dnd_vtt_backend/content/`)

### 6.1 JSON key casing is mixed, including inside single files

| Directory | `snake_case` keys | `camelCase` keys | Examples |
|-----------|---:|---:|---|
| `spells/`, `monsters/` | 20 / 22 | 0 | `casting_time`, `hit_points` |
| `classes/` | 35 | 24 | `hit_die` **and** `goldAlternative`, `maxByLevel` |
| `feats/` | 3 | 20 | `srd_5_2_1`, `rules_text` **and** `abilityIncrease`, `exclusiveGroup` |
| `races/` | 5 | 8 | `creature_type` **and** `countsAgainstLimit`, `sourceKey` |
| `items/` | 9 | 4 | `requires_attunement`, `image_url` **and** `itemIndex`, `namePrefix` |

The pattern looks like: original SRD-style fields are `snake_case`, and the `TraitGrant` / effect
vocabulary added later is `camelCase`. A single `class.json` therefore has both. Authors have to
remember which sub-object is which, and a typo is not caught (content is loaded as untyped JSON,
`content.service.ts` casts with `as T`). There is no JSON schema, and the `*-content.spec.ts` files
validate individual classes rather than the schema as a whole.

### 6.2 Content has two indexing conventions

Entities are keyed by `index` (kebab-case slug) in the JSON, `toContentIndex()` regenerates it from
a name in 5 frontend places (3.1), and `backgrounds.controller.ts` lists backgrounds by reading the
directory directly instead of going through `ContentService` like every other content type.
`content.service.ts` mixes cached `readFileSync` loads with a directory scan on a separate path
(`ITEM_ART_PATH`, `readdirSync` at `content.service.ts:377`), and `inventory.service.ts:52` reads
`content/plans/magic-item-plans.json` itself with a cwd-relative `readFileSync` instead of going
through `ContentService` (every other content file is loaded there).

**Status: partly fixed.** `src/content/content-schema.spec.ts` now enforces kebab-case `index` matching the file name for every entity, and snake_case-only top-level keys for spells/monsters. The casing rule (SRD fields snake_case, `TraitGrant`/effect vocabulary camelCase) is documented in CLAUDE.md rather than renamed, since renaming keys would need a data migration across classes/feats/races/items and frontend readers. The magic-item plans file now loads through `ContentService.getMagicItemPlans()` (cached). `BackgroundsController` is left as is: it lists *uploaded* images in `uploads/backgrounds/`, not SRD content. The item-art directory scan in `ContentService` is also kept, as it reads the gitignored uploads folder.
