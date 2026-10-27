# Review of CODEBASE_INCONSISTENCIES.md + what to actually change
Scope looked at: CODEBASE_INCONSISTENCIES.md; backend main.ts, app.module.ts, auth.module.ts, jwt-secret.ts,
characters.controller.ts, maps.controller.ts/maps.service.ts (access + fog + walls), tokens.gateway.ts,
encounter-presence.gateway.ts, content.controller.ts/content.service.ts (single-item lookups),
database.service.ts + migrations/{index,migration,v035}.ts, character-lock.ts, inventory.service.ts (locks),
campaigns.service.ts setPartyLevel; frontend content.service.ts get(), auth.interceptor.ts, fog-tool.ts,
toContentIndex/adminGuard/Open5e/Dnd5e/fetch/localStorage greps; git ls-files for stray files; ci.yml run steps.
Not checked: Prettier counts (2.1), naming/template/subscription counts (2.2–2.4), casing counts (2.7, 6.1),
token-border/spellcasting mirror details (3.2), section 7 claims about MAINTAINABILITY_ISSUES.md, TODO.md.

## Verdict on the audit (per section)
- Overall: accurate as a consistency inventory; most file/line claims check out. Its weakness is
  framing: it ranks by "inconsistency" and misses the real bugs that sit right next to its findings.
- 1.1 DTOs: inventory accurate (characters 19x Record, maps 3x Record + ~8 inline types). "Validation
  silently skipped" is OVERSTATED — services hand-validate (maps.service.ts:695-698 ambient,
  :711-723 walls, `repository.requiredString` in characters). Suggested fix is UNSAFE for characters:
  with global `whitelist: true` (main.ts:31), a DTO on PUT /characters/:id, drafts, level-up would strip
  every undeclared JSON-blob key = silent data loss. Restrict DTOs to fixed-shape endpoints.
- 1.2 Config: CORS triplication and the three "is dev" notions are real. But "ConfigModule loaded but
  unused" is WRONG in effect — `ConfigModule.forRoot()` is what loads `dnd_vtt_backend/.env` into
  process.env (no dotenv elsewhere; ecosystem.config.js only sets NODE_ENV/PORT). Removing it would
  break JWT_SECRET/DB_PATH/CORS_ORIGINS. Missed bug: the gateways read CORS_ORIGINS inside the
  `@WebSocketGateway({...})` decorator (tokens.gateway.ts:27-33, encounter-presence.gateway.ts:37-43),
  evaluated at import time, BEFORE ConfigModule loads .env. So .env's CORS_ORIGINS is honoured by REST
  but ignored by sockets (they always use the hard-coded default). JWT is fine (auth.module.ts uses
  registerAsync, deliberately lazy).
- 1.3/1.4 Gateway SQL + bare Error: accurate. Rules already diverge: maps.service.ts:849 `isCampaignDm`
  handles the `default` campaign (admin), tokens.gateway.ts:164 `mapRole` does not. Fix caveat the audit
  missed: MapsService injects TokensGateway (maps.service.ts:34), so "gateway calls the service" creates
  a DI cycle — extract a small access service instead.
- 1.5 Guards: accurate. Slight severity upgrade: unguarded `GET content/{monsters,items,spells}/:index`
  (content.controller.ts:112,155,239) dispatch `custom:<uuid>` to DB homebrew (content.service.ts:258-289),
  so a DM's custom content is readable unauthenticated by anyone holding the id. Low (uuid), but not
  just style.
- 1.7/5.1 Scaffold: claim "e2e only passes because it boots AppModule" is wrong — AppModule
  (app.module.ts) registers NO controllers/providers, so AppController is orphaned and
  test/app.e2e-spec.ts would 404. Also `src/app.controller.spec.ts` exists and runs in CI; delete it with
  the scaffold.
- 2.4 raw fetch: real, but the audit missed the consequence: ContentService.get
  (frontend content.service.ts:509-519) attaches the token by hand and so skips the interceptor's
  401->refresh path (auth.interceptor.ts:17-23). Access tokens are 15m (auth.module.ts:16), so the first
  uncached guarded content load after expiry fails with "Failed to load content".
- 2.6 draft key duplication: verified (character-wizard-page.ts:32,42-43 vs character-wizard.ts:50-51).
- 3.1 toContentIndex x5: verified. Low-value, easy.
- 4.1 CLAUDE.md stale: verified (applyVN, `notes` module, missing wiki/companions/users/player/backgrounds).
  Worth doing early because it misleads every AI session, including the local implementer.
- 4.2 Migrations: accurate, but "forgets to stamp => re-runs every boot" only bites the LAST migration
  (a later stamp masks it). All 36 currently stamp. Bigger miss: no migration runs in a transaction
  (no `transaction`/`BEGIN` anywhere in src), so a mid-migration crash leaves a half-applied schema.
- 5.2 stray files: verified all tracked (.deb, test-results/*, probe.cjs, campaign-rewards-import.json).
- 6.x content casing: real but Impact "Medium" is too high for a rename; documenting the rule (SRD
  fields snake_case, grant/effect vocabulary camelCase) is the right size. A full rename touches content
  JSON + both codebases + stored character blobs — not worth it.
- 3.2 shared rules package: correct diagnosis, but a workspace package is a big build change for a
  two-subproject repo; parity tests on fixtures are the proportionate step.

## Missed by the audit (most important)
- Lost-update race on fog painting: fog-tool.ts:66-86 fires a POST every ~50ms without awaiting;
  maps.service.ts:581-601 `paintFog` does read hidden_cells -> modify -> write with awaits between and
  no lock. Overlapping strokes drop cells; a dropped "hide" means players see what the DM hid.
- Character writes outside `withCharacterLock`: campaigns.service.ts:562-588 `setPartyLevel` rewrites
  each member's full `data` blob unlocked (races with cast/rest/inventory ops);
  inventory.service.ts:84-121 `initialize` writes characters.data under lock key `inventory-init:<id>`,
  not `<id>`. Lock is non-reentrant (character-lock.ts) — any fix must not nest same-key acquisition.
- DatabaseService is provided/exported by AuthModule (auth.module.ts:26,32) instead of a @Global
  DatabaseModule — odd ownership, low priority.

## How it fits together
NestJS modules per domain; raw SQL via a single DatabaseService (libsql, owned by AuthModule and
re-exported). Character state is one JSON `data` blob mutated by read-modify-write inside
`withCharacterLock(id)` (common/character-lock.ts, in-process promise queue, non-reentrant). Maps REST
mutations call TokensGateway to broadcast; gateways do their own access SQL. Global
ValidationPipe({whitelist, transform}) only affects DTO-typed bodies. Env comes from .env via
ConfigModule.forRoot at AppModule construction; anything read at import time misses it. Frontend:
standalone components, services in core/services, HttpClient + auth.interceptor (401 refresh) except a
few raw fetch() sites. Backend style: single quotes, trailing commas; tests colocated *.spec.ts (Jest).

## Proposals (ranked)
### 1. Serialize fog mutations per map
- Why: lost updates in paintFog (maps.service.ts:581-601) under 50ms fire-and-forget strokes
  (fog-tool.ts:69-86); can un-hide DM-hidden cells.
- What: generalize common/character-lock.ts into a keyed lock (`withKeyLock(key, work)`; keep
  `withCharacterLock` as a thin wrapper so callers don't change). Wrap paintFog, setFogEnabled,
  resetFog bodies in `withKeyLock('fog:' + mapId, ...)`. Add a spec firing two concurrent paintFog
  calls with disjoint cells and asserting both sets end up hidden.
- Impact: high   Effort: S   Risk: deadlock only if a fog method calls another fog method inside the
  lock (they don't today — keep it that way).
- Local-model fit: needs care — mechanical, but give it the exact three methods and the test.
- Touches: common/character-lock.ts, maps/maps.service.ts, maps/maps.service.spec.ts (new).

### 2. Close unlocked character-blob writes
- Why: campaigns.service.ts:562-588 setPartyLevel and inventory.service.ts:84-121 initialize write
  characters.data outside `withCharacterLock(<id>)`.
- What: setPartyLevel: per row, re-read and write inside `withCharacterLock(row.id)`. inventory
  initialize: verify no caller already holds `<id>` before switching its key; if a caller does, do
  the write in that caller instead.
- Impact: med   Effort: S-M   Risk: self-deadlock (lock is non-reentrant).
- Local-model fit: keep for Claude — needs call-graph reasoning on lock nesting.
- Touches: campaigns/campaigns.service.ts, characters/inventory.service.ts.

### 3. One backend config module, lazily read (corrects audit 1.2)
- Why: CORS list x3 (main.ts:23-28, tokens.gateway.ts:27-33, encounter-presence.gateway.ts:37-43);
  gateway copies read env before .env is loaded; DEV_BYPASS checked in 4 places; DB_PATH default x2.
- What: `src/common/config.ts` exporting FUNCTIONS (not constants): `corsOrigins()`, `isDevBypass()`,
  `dbPath()`. In gateways use a callback origin so it is evaluated per handshake:
  `origin: (o, cb) => cb(null, !o || corsOrigins().includes(o))`. Replace the DEV_BYPASS/DB_PATH
  literals. Do NOT remove ConfigModule.forRoot (it loads .env). Leave jwt-secret.ts `isDevRun` alone
  but add a comment explaining why it is broader (NODE_ENV=test).
- Impact: med   Effort: S   Risk: socket handshakes rejected if the callback is wrong — test from the
  Capacitor origin and the prod domain.
- Local-model fit: good — small, explicit, file list known.
- Touches: common/config.ts (new), main.ts, maps/tokens.gateway.ts, encounters/encounter-presence.gateway.ts,
  auth/jwt.guard.ts, auth/socket-auth.service.ts, common/database.service.ts, common/migrations/v035.ts.

### 4. Docs + repo hygiene quick wins (audit 4.1, 5.1, 5.2)
- Why: CLAUDE.md misdescribes migrations/modules and is loaded into every session; stray tracked files.
- What: update CLAUDE.md (migrations in common/migrations/vNNN.ts registered in MIGRATIONS; no v22;
  module list; `start:prod`; Open5e/Dnd5e removed; casing rule for new fields: SRD-derived keys
  snake_case, TraitGrant/effect vocabulary camelCase). Delete open5e.service.ts, dnd5e.service.ts,
  core/guards/admin.guard.ts (fix the settings-dialog.ts:26 comment), app.controller.ts,
  app.service.ts, app.controller.spec.ts, and test/app.e2e-spec.ts (or replace with a real smoke test).
  `git rm --cached` the .deb, test-results/*, probe.cjs; ask user about campaign-rewards-import.json.
- Impact: med   Effort: S   Risk: none functional; run `npm test` + `ng build`.
- Local-model fit: good.
- Touches: CLAUDE.md, listed files.

### 5. ContentService.get via HttpClient (frontend)
- Why: raw fetch skips 401 refresh (content.service.ts:509-519 vs auth.interceptor.ts:17-23).
- What: replace fetch with `firstValueFrom(this.http.get<T>(...))`, drop manual header; keep cache.
  Check encounter-form-dialog.ts:588 (data-URL fetch, fine) and delete dnd5e fetch with #4.
- Impact: med   Effort: S   Risk: none if the interceptor already handles /api URLs.
- Local-model fit: good.
- Touches: dnd_vtt_frontend/src/app/core/services/content.service.ts.

### 6. Shared map/encounter access rules + WsException (audit 1.3/1.4)
- Why: access SQL duplicated and already divergent (gateway lacks `default` campaign branch).
- What: extract `MapAccessService` (resolveMapReadAccess/isCampaignDm from maps.service.ts:849-937)
  and an encounter equivalent; inject into both service and gateway (avoids the
  MapsService<->TokensGateway cycle). Gateways throw `WsException`.
- Impact: med   Effort: M   Risk: authorization regression = fog/map spoilers.
- Local-model fit: keep for Claude — security-sensitive, cross-module DI.
- Touches: maps/*, encounters/encounter-presence.gateway.ts, new maps/map-access.service.ts.

### 7. Narrow DTO pass + content guard default + migration guardrails
- What (a) DTOs only for fixed-shape map/session/encounter bodies (fog paint, toggles, ambient, token
  move/color/target_map, set map, visibility). NOT characters update/draft/level-up.
  (b) content.controller.ts: class-level `@UseGuards(JwtGuard)` — confirm first that no
  unauthenticated caller needs these GETs (frontend always sends a token).
  (c) migrations: spec asserting MIGRATIONS versions strictly increasing; runner stamps
  `PRAGMA user_version` after each `up` (idempotent with existing stamps).
- Impact: low-med   Effort: S each   Risk: (a) whitelist stripping a field a client sends — compare
  against frontend battle-map.service.ts payloads; (b) breaks any public consumer.
- Local-model fit: good for (a) and (c) one controller at a time; (b) needs care.
- Touches: maps/maps.controller.ts + dto/, sessions/encounters/campaigns controllers,
  content/content.controller.ts, common/database.service.ts, common/migrations/index.spec.ts (new).

Deprioritize: Prettier sweep (do it, but as its own commit + .git-blame-ignore-revs, right after
merges land, not mid-refactor); file-naming/template/shared-folder tidy (2.2, 2.3, 2.8); content JSON
key renames (6.1); shared rules package (3.2) — parity fixture tests if anything.

## Recommended order
1 (real bug, small) -> 4 and 3 (cheap, unblock clearer docs/config) -> 5 -> 2 (Claude) -> 6 (Claude,
after 3 so gateways use config.ts) -> 7. Prettier sweep last, once code-refactor branch merges, so it
doesn't conflict with PLAN_SPLIT_MONOLITHS.md Phase 2 (maps.service split), which also overlaps #6 —
do #6 as part of that phase rather than separately.

## Open questions for the user
- Are the unguarded `content/*/:index` GETs meant to be public (e.g. shared links, PWA offline)?
- campaign-rewards-import.json: keep (move to docs/ or scripts/) or delete?
- Replace test/app.e2e-spec.ts with a real smoke test (boots app, hits /api/content/classes) or drop
  `test:e2e` entirely?
- Willing to accept a one-shot frontend Prettier commit now, or wait until the refactor branch merges?
