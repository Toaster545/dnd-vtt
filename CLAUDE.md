# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Detailed documentation index: `docs/README.md`.

A self-hosted D&D 5e Virtual Tabletop. Angular 22 frontend + NestJS backend, SQLite (`@libsql/client`) storage,
Konva.js battle-map canvas, socket.io for live token sync. Designed to run on one machine and be exposed via a
Cloudflare Tunnel — no cloud services, no separate frontend host.

## Commands

Run from the repo root (`dnd/`), which just shells out to the two subprojects:

```bash
npm run dev          # runs backend (start:dev) and frontend (watch) concurrently
npm run build         # builds frontend then backend
npm start             # runs the built backend (production)
```

Backend (`dnd_vtt_backend/`):

```bash
npm run start:dev     # nest --watch, with DEV_BYPASS=true (see Auth below)
npm run start         # nest start, no dev bypass (not production mode)
npm run start:prod    # NODE_ENV=production node dist/main (what root `npm start` runs)
npm run build         # nest build -> dist/
npm run lint          # eslint --fix (mutates files)
npm run lint:check    # eslint without --fix (CI runs `npx eslint` directly, not this script)
npm test              # jest unit tests (*.spec.ts, colocated in src/)
npm test -- characters/characters.service.spec  # run a single test file
npm run test:e2e      # jest e2e tests, config in test/jest-e2e.json
node scripts/make-admin.mjs <email>   # promote a registered user to admin/DM
node scripts/download-monster-tokens.mjs   # fetch 5etools monster token art into uploads/monster-tokens/ (gitignored)
node scripts/download-item-art.mjs   # fetch 5etools item illustrations into uploads/item-art/ (gitignored), served as `art_url`
```

Frontend (`dnd_vtt_frontend/`):

```bash
ng serve               # dev server on :4200, proxies /api via proxy.conf.json
ng build                # prod build -> dist/dnd-app/browser/ (what the backend serves)
ng build --configuration development   # dev build
ng test                 # Vitest
```

There is no single-command "run the whole app": the frontend must be built (`ng build` or
`npm run watch` for a rebuild-on-change dev build) into `dnd_vtt_frontend/dist/dnd-app/browser/`
before the backend will serve current frontend code — the backend does not proxy to `ng serve`
in production mode. During active frontend dev, use `ng serve` (port 4200) against the backend on
port 3000 instead of rebuilding on every change.

## Architecture

**Single server, single origin.** `dnd_vtt_backend/src/main.ts` boots a NestJS `NestExpressApplication`,
then reaches into the raw Express instance to register static file serving in a specific order so that
Nest's routing doesn't intercept SPA fallback:

1. `/uploads/**` — static-served uploads (`/uploads/maps` is blocked with a 404)
2. static assets from `dnd_vtt_frontend/dist/dnd-app/browser/`
3. everything else that isn't `/api` or `/socket.io` falls through to `index.html` (SPA fallback)

All REST routes are mounted under the global prefix `/api` (`app.setGlobalPrefix('api')`). One Cloudflare
Tunnel forwards a domain to `localhost:3000`; there's no separate frontend deployment/host.

**Auth & dev bypass.** JWT auth via `JwtGuard` (`src/auth/jwt.guard.ts`). Special case: when
`DEV_BYPASS=true` (set automatically by `npm run start:dev`), the literal bearer token `"dev"` is
accepted and resolves to the first `admin` row in the DB — useful for quick local testing but means
`start:dev` is **not** a safe mode to expose publicly. Roles are `admin` (DM) and `player`, enforced
separately by `AdminGuard`.

**Database.** `DatabaseService` (`src/common/database.service.ts`) owns a `@libsql/client` SQLite
connection at `DB_PATH` (default `./data/dnd.db`) and runs hand-rolled migrations gated by
`PRAGMA user_version`. Each migration is a file `src/common/migrations/vNNN.ts` exporting a
`Migration` (`version` + `up(ctx)`), registered in order in `migrations/index.ts`. A migration must
stamp `PRAGMA user_version = N` as its last step; the runner throws if it doesn't, or if the
registry is out of order. There is deliberately no v022 — never add one; use the next free number.
Migrations must not depend on current content files (v035 does, as a historical exception). There is
no ORM and no separate migration tool. Character data lives in a single JSON `data` blob column;
character records are read/written as a loosely-typed JSON document, not normalized columns.

**Static 5e game content vs. character data.** `ContentModule` (`src/content/`) serves static SRD-derived
game data (classes, races, backgrounds, feats, items, spells) from JSON files under `dnd_vtt_backend/content/`,
cached in memory per-process. The frontend gets all game data from these backend endpoints
(`core/services/content.service.ts`); there is no external SRD API. Content JSON keys: original
SRD-style fields are `snake_case`, the `TraitGrant`/effect vocabulary is `camelCase` — follow the
surrounding object (see `content-schema.spec.ts`).

**Feats.** Each feat (`content/feats/*.json`) has a `category` (`origin`, `general`, or
`fighting_style`) and an optional `prerequisite` (ability score minimums, armor/spellcasting
requirements, a required class feature, or specific classes). Per the 2024 rules, a feat choice
that doesn't name a specific category can be filled from *any* category as long as its
prerequisite is met — e.g. a Fighter's level 4 ASI-or-feat slot can take a Fighting Style feat
too, since having the Fighting Style feature (gained at level 1) satisfies that feat's only
prerequisite. `class-step.ts`'s `qualifiesForFeat()` checks prerequisites; don't re-narrow feat
pickers to a single category without re-checking that rule. A feat's mechanical grant is data,
not just description text: `abilityIncrease` (a flat or player-chosen +1 ability, most General
feats) and `effects` (the same `TraitEffect` shape a class `choice` option uses, e.g. a Fighting
Style's `ac_bonus`) are both applied automatically by `character-wizard.ts` once a feat is picked,
independent of each other — a feat can carry both, either, or neither.

**Grant types.** Class/race/background levels describe their choices as a `TraitGrant` union
(`feature`, `choice`, `skill_choice`, `weapon_mastery`, `ability_choice`, `feat_pick`) that
`class-step.ts`/`.html` renders generically rather than one-off UI per class. `ability_choice`
is the class ASI slot (`allowFeat` lets the player take a feat instead, stored under a
companion `${key}:feat` trait key); `feat_pick` is a pure feat picker with no ASI alternative,
sourced from the Feats content and filtered to a `category` (e.g. a class's Fighting Style
feature) — see `fighter.json`/`paladin.json`/`ranger.json` for the pattern.

**Real-time tokens.** `MapsModule` exposes both REST endpoints (map/token CRUD, admin-only for mutation)
and a socket.io gateway (`tokens.gateway.ts`) that broadcasts token, fog, lighting and measure/level events to connected
clients on the same port as the REST API (no separate WS server/port). There are three gateways in total
(`TokensGateway`, `EncounterPresenceGateway`, `CompanionsGateway`); see `docs/architecture/realtime.md`.

**Modules:** `auth`, `characters`, `content`, `maps` (+ `tokens.gateway`), `sessions`, `encounters`,
`campaigns`, `wiki`, `companions`, `users`, `player`, `backgrounds` — one Nest module each, following the standard controller/service/module triplet.

### Frontend structure

Routing (`app.routes.ts`) has no route-level DM/player split — everything logged-in lives under a
single `home` shell route (`features/shell/`), and which view of a campaign you land on is decided
by ownership (`CampaignsComponent.campaignLink`), not by a role-gated path. DM-only campaign
management screens live under `features/dm/dm-campaigns/`, gated per-endpoint on the backend by
`campaign.dm_id` rather than by role.

- `core/guards` — `authGuard`, `homeRedirectGuard`, `staleSessionGuard`
- `core/interceptors` — `auth.interceptor.ts` injects the Bearer token onto outgoing requests
- `core/models` — one file per backend domain (`campaign`, `character`, `encounter`,
  `companion`, `player`, `session`, `user`, `wiki`)
- `core/services` — one per backend domain (`auth`, `character`, `campaign`, `battle-map`, `content`,
  `session`, `encounter`, `companion`, `wiki`, `socket`, `activity`/`recent-activity`), plus
  `character-stats`/`character-actions` for derived character math and app-shell services
  (`hub-view`, `player-context`, `pwa`, `background`, `color-scheme`, `ui-scale`)
- `core/utils` — pure helpers (`character-effects`, `background-skills`, `progressive-choice`,
  `starting-equipment`, `avatar`, `spellcasting`, `token-border`, `error-message`)
- `features/` — routed, lazy-loaded standalone components (`app.routes.ts` uses `loadComponent` per
  route, no NgModules)
- `features/characters/character-wizard/steps/` — one step component per wizard page (race, class,
  background, abilities, equipment, spells, details)
- `features/dm/dm-campaigns/` — DM campaign management: hub, maps, session, encounter-play
- `features/player/player-campaigns/` — the joined-member counterpart: hub, session
- `features/battle-map/` — Konva canvas plus toolbar/add-token-panel/turn-order-panel components
- `features/create-content/` — DM-authored content (currently monsters)
- `shared/layout/` — `main-layout`, `app-header`, `page-header`
- `shared/components/` — every cross-feature reusable component, one folder each (confirm-dialog +
  `ConfirmService`, avatar-creator-dialog, party-list, description-dialog, ...)

Styling is SCSS with Tailwind utilities layered in (`tailwind.config.js`, `postcss.config.js`); Angular
Material is a dependency but usage is selective, not app-wide.

### Project structure (top-level, illustrative not exhaustive)

```
dnd_vtt_backend/
  src/
    auth/            # AuthModule, JwtGuard, AdminGuard, @Public()
    characters/       # character CRUD, JSON `data` blob (v2 schema)
    content/           # static SRD content service (classes, races, ..., class-content/, dto/)
    maps/               # map/token REST + tokens.gateway.ts (socket.io)
    sessions/            # session CRUD (dto/)
    encounters/           # encounter CRUD (dto/)
    campaigns/             # campaign CRUD, dm_id ownership (dto/)
    wiki/                   # campaign wiki pages
    companions/              # companions / familiars
    common/                  # DatabaseService (libsql), migrations/vNNN.ts
    types/                    # shared TS types
    app.module.ts / main.ts
  content/                     # SRD JSON: backgrounds, classes, feats, items, monsters, races, spells
  scripts/make-admin.mjs

dnd_vtt_frontend/
  src/app/
    core/
      guards/          # authGuard, homeRedirectGuard, staleSessionGuard
      interceptors/     # auth.interceptor.ts
      models/            # campaign, character, companion, encounter, player, session, user, wiki
      services/           # one per backend domain + character-stats/-actions
      utils/                # character-effects, background-skills, progressive-choice, ...
    features/
      auth/             # login, register
      dashboard/
      settings/
      shell/             # single post-login shell, hosts the `home/*` child routes
      campaigns/          # campaign list (CampaignsComponent decides DM vs player link)
      dm/dm-campaigns/     # dm-campaign-hub, dm-campaign-maps, dm-campaign-session, dm-encounter-play
      player/player-campaigns/  # player-campaign-hub, player-campaign-session
      characters/          # character-play-sheet, character-wizard/steps/*
      battle-map/            # Konva canvas + toolbar/add-token-panel/turn-order-panel
      create-content/          # monsters (monster-form)
    shared/
      layout/            # main-layout, app-header, page-header
      components/          # party-list, description-dialog, ...
      directives/
    app.routes.ts
```

## Conventions

- Backend: single quotes, trailing commas (`.prettierrc`).
- Frontend: single quotes, 100-char print width, Angular parser for `.html` templates (`.prettierrc`).
- Standalone Angular components throughout — no `NgModule`-based features.
- Frontend files: no `.component.ts` suffix (`wiki-workspace.ts`, class `WikiWorkspaceComponent`);
  run `npm run format` before committing — CI runs `format:check`. Prettier reflows whitespace in
  templates, so put `<!-- prettier-ignore -->` above elements where adjacency matters (`name*`).
- Frontend templates: external `templateUrl` by default; inline `template:` only for tiny
  (~10 line) components.
- Frontend async: `HttpClient` only inside `core/services` (never raw `fetch` except for data URLs and
  the token-refresh call, which must bypass the interceptor); `firstValueFrom` for one-shot calls,
  `toSignal`/`takeUntilDestroyed` for streams; show failures with `getErrorMessage(err, fallback)`
  (`core/utils/error-message.ts`), never by reading `err.error?.message` by hand.
- Storage keys shared between files live in `core/utils/storage-keys.ts`. New keys:
  `dnd-vtt-<feature>-<thing>`; don't rename existing ones (resets users' saved values).
- Model field casing: fields that mirror a backend/DB column stay `snake_case`; fields inside the JSON
  `data` blobs written by newer code (characters' inventory/spell state) are `camelCase`. Within one
  interface follow the surrounding fields; don't rename existing ones without a data migration.
