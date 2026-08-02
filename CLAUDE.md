# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A self-hosted D&D 5e Virtual Tabletop. Angular 22 frontend + NestJS backend, SQLite (`@libsql/client`) storage,
Konva.js battle-map canvas, socket.io for live token sync. Designed to run on one machine and be exposed via a
Cloudflare Tunnel — no cloud services, no separate frontend host.

## Commands

Run from the repo root (`dnd_vtt/`), which just shells out to the two subprojects:

```bash
npm run dev          # runs backend (start:dev) and frontend (watch) concurrently
npm run build         # builds frontend then backend
npm start             # runs the built backend (production)
```

Backend (`dnd_vtt_backend/`):

```bash
npm run start:dev     # nest --watch, with DEV_BYPASS=true (see Auth below)
npm run start         # nest start, no dev bypass
npm run build         # nest build -> dist/
npm run lint          # eslint --fix
npm test              # jest unit tests (*.spec.ts, colocated in src/)
npm test -- characters/characters.service.spec  # run a single test file
npm run test:e2e      # jest e2e tests, config in test/jest-e2e.json
node scripts/make-admin.mjs <email>   # promote a registered user to admin/DM
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

1. `/uploads/**` — static-served uploaded map images
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
connection at `DB_PATH` (default `./data/dnd.db`) and runs its own hand-rolled migrations gated by
`PRAGMA user_version` (see `runMigrations()` / `applyV1()` / `applyV2()`). There is no ORM and no
separate migration tool — schema changes are added as a new `applyVN()` method plus a version bump.
Notably, character data was migrated from explicit columns (v1) to a single JSON `data` blob column (v2);
character records are read/written as a loosely-typed JSON document, not normalized columns.

**Static 5e game content vs. character data.** `ContentModule` (`src/content/`) serves static SRD-derived
game data (classes, races, backgrounds, feats, items, spells) from JSON files under `dnd_vtt_backend/content/`,
cached in memory per-process. This is distinct from `Open5eService`/`Dnd5eService` on the frontend, which
historically hit the external Open5e API — check which one a given feature actually uses before assuming
game data comes from the network vs. local files.

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
and a socket.io gateway (`tokens.gateway.ts`) that broadcasts token position changes to all connected
clients on the same port as the REST API (no separate WS server/port).

**Modules:** `auth`, `characters`, `content`, `maps` (+ `tokens.gateway`), `sessions`, `encounters`,
`campaigns`, `notes` — one Nest module each, following the standard controller/service/module triplet.

### Frontend structure

Routing (`app.routes.ts`) has no route-level DM/player split — everything logged-in lives under a
single `home` shell route (`features/shell/`), and which view of a campaign you land on is decided
by ownership (`CampaignsComponent.campaignLink`), not by an `adminGuard`-gated path. DM-only campaign
management screens live under `features/dm/dm-campaigns/`, gated per-endpoint on the backend by
`campaign.dm_id` rather than by role.

- `core/guards` — `authGuard`, `adminGuard`, `homeRedirectGuard`, `staleSessionGuard`
- `core/interceptors` — `auth.interceptor.ts` injects the Bearer token onto outgoing requests
- `core/models` — one file per backend domain (`campaign`, `character`, `encounter`, `notes`,
  `session`, `user`)
- `core/services` — one per backend domain (`auth`, `character`, `campaign`, `battle-map`, `content`,
  `session`, `encounter`, `notes`, `socket`, `activity`/`recent-activity`), plus `open5e`/`dnd5e` for
  external SRD data and `character-stats`/`character-actions` for derived character math
- `core/utils` — pure helpers (`character-effects`, `background-skills`, `progressive-choice`,
  `starting-equipment`, `avatar`, `error-message`)
- `features/` — routed, lazy-loaded standalone components (`app.routes.ts` uses `loadComponent` per
  route, no NgModules)
- `features/characters/character-wizard/steps/` — one step component per wizard page (race, class,
  background, abilities, equipment, spells, details)
- `features/dm/dm-campaigns/` — DM campaign management: hub, maps, session, encounter-play
- `features/player/player-campaigns/` — the joined-member counterpart: hub, session
- `features/battle-map/` — Konva canvas plus toolbar/add-token-panel/turn-order-panel components
- `features/create-content/` — DM-authored content (currently monsters)
- `shared/layout/` — `main-layout`, `app-header`, `page-header`
- `shared/` — other cross-feature reusable components (confirm dialog, notes-panel, party-list,
  portrait-picker-dialog, description-dialog)

Styling is SCSS with Tailwind utilities layered in (`tailwind.config.js`, `postcss.config.js`); Angular
Material is a dependency but usage is selective, not app-wide.

### Project structure (top-level, illustrative not exhaustive)

```
dnd_vtt_backend/
  src/
    auth/            # AuthModule, JwtGuard, AdminGuard
    characters/       # character CRUD, JSON `data` blob (v2 schema)
    content/           # static SRD content service (classes, races, ..., class_content/, dto/)
    maps/               # map/token REST + tokens.gateway.ts (socket.io)
    sessions/            # session CRUD (dto/)
    encounters/           # encounter CRUD (dto/)
    campaigns/             # campaign CRUD, dm_id ownership (dto/)
    notes/                  # session/campaign notes (dto/)
    common/                  # DatabaseService (libsql, hand-rolled migrations)
    types/                    # shared TS types
    app.module.ts / main.ts
  content/                     # SRD JSON: backgrounds, classes, feats, items, monsters, races, spells
  scripts/make-admin.mjs

dnd_vtt_frontend/
  src/app/
    core/
      guards/          # authGuard, adminGuard, homeRedirectGuard, staleSessionGuard
      interceptors/     # auth.interceptor.ts
      models/            # campaign, character, encounter, notes, session, user
      services/           # one per backend domain + open5e/dnd5e + character-stats/-actions
      utils/                # character-effects, background-skills, progressive-choice, ...
    features/
      auth/             # login, register
      dashboard/
      settings/
      shell/             # single post-login shell, hosts the `home/*` child routes
      campaigns/          # campaign list (CampaignsComponent decides DM vs player link)
      dm/dm-campaigns/     # dm-campaign-hub, dm-campaign-maps, dm-campaign-session, dm-encounter-play
      player/player-campaigns/  # player-campaign-hub, player-campaign-session
      characters/          # character-play-sheet, character-wizard/steps/*, character-preview
      battle-map/            # Konva canvas + toolbar/add-token-panel/turn-order-panel
      create-content/          # monsters (monster-form)
    shared/
      layout/            # main-layout, app-header, page-header
      components/          # notes-panel, party-list, description-dialog
      confirm-dialog/, portrait-picker-dialog/, directives/, pipes/
    app.routes.ts
```

## Conventions

- Backend: single quotes, trailing commas (`.prettierrc`).
- Frontend: single quotes, 100-char print width, Angular parser for `.html` templates (`.prettierrc`).
- Standalone Angular components throughout — no `NgModule`-based features.
