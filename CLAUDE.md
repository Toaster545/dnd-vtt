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
game data (classes, races, backgrounds, items, spells) from JSON files under `dnd_vtt_backend/content/`,
cached in memory per-process. This is distinct from `Open5eService`/`Dnd5eService` on the frontend, which
historically hit the external Open5e API — check which one a given feature actually uses before assuming
game data comes from the network vs. local files.

**Real-time tokens.** `MapsModule` exposes both REST endpoints (map/token CRUD, admin-only for mutation)
and a socket.io gateway (`tokens.gateway.ts`) that broadcasts token position changes to all connected
clients on the same port as the REST API (no separate WS server/port).

**Modules:** `auth`, `characters`, `content`, `maps` (+ `tokens.gateway`), `sessions` — one Nest module
each, following the standard controller/service/module triplet.

### Frontend structure

- `core/guards` — `authGuard`, `adminGuard` (route-level)
- `core/interceptors` — injects the Bearer token onto outgoing requests
- `core/services` — one per backend domain (`auth`, `character`, `battle-map`, `content`, `session`,
  `socket`), plus `open5e`/`dnd5e` for external SRD data and `character-stats` for derived character math
- `features/` — routed, lazy-loaded standalone components (`app.routes.ts` uses `loadComponent` per
  route, no NgModules)
- `features/dm/` — DM-only area (character creation wizard, session management, live play), gated by
  `adminGuard` at the `dm` route
- `features/dm/dm-create/dm-characters/character-wizard/steps/` — one step component per wizard page
  (race, class, background, abilities, equipment, spells, details)
- `shared/` — cross-feature reusable components (confirm dialog, character display)

Styling is SCSS with Tailwind utilities layered in (`tailwind.config.js`, `postcss.config.js`); Angular
Material is a dependency but usage is selective, not app-wide.

## Conventions

- Backend: single quotes, trailing commas (`.prettierrc`).
- Frontend: single quotes, 100-char print width, Angular parser for `.html` templates (`.prettierrc`).
- Standalone Angular components throughout — no `NgModule`-based features.
