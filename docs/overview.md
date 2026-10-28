# Overview: what the app is, its tech stack, repo layout, and the commands to run, build, test and lint it.

Last updated: 2026-10-28 (commit 00cb49a)

## What the app is

A self-hosted D&D 5e Virtual Tabletop. Players create and manage characters; the Dungeon Master (DM) runs campaigns, encounters and battle maps (including maps exported from Dungeondraft). Everything runs as one NestJS server on one port that serves the REST API (`/api`), socket.io, uploaded files and the built Angular app. It is meant to run on one machine and be exposed through a Cloudflare Tunnel; there is no separate frontend host.

The Capacitor app id is `ca.mathomelab.dndvtt` and the app name is `NatOne`. Mobile, PWA and Capacitor details are in [mobile/](mobile/architecture.md).

Sources: `package.json`, `dnd_vtt_backend/src/main.ts` (`bootstrap`), `dnd_vtt_frontend/capacitor.config.ts`, [CLAUDE.md](../CLAUDE.md), [README.md](../README.md).

## Tech stack

| Layer | Technology | Defined in |
|---|---|---|
| Frontend | Angular 22 (standalone components), TypeScript 6, SCSS + Tailwind 3 (`tailwind.config.js`), Angular Material (selective use) | `dnd_vtt_frontend/package.json` |
| Battle map canvas | Konva 10 | `dnd_vtt_frontend/package.json` |
| Wiki editor | CodeMirror 6 (`@codemirror/*`) | `dnd_vtt_frontend/package.json` |
| Real-time client | `socket.io-client` 4 | `dnd_vtt_frontend/package.json` |
| Offline / install | `@angular/service-worker` (PWA), Capacitor 8 (Android, iOS) | `dnd_vtt_frontend/package.json`, `ngsw-config.json`, `capacitor.config.ts` |
| Backend | NestJS 11 on Express (`@nestjs/platform-express`) | `dnd_vtt_backend/package.json` |
| Real-time server | `@nestjs/websockets` + `@nestjs/platform-socket.io` (socket.io 4) | `dnd_vtt_backend/package.json` |
| Database | SQLite through `@libsql/client` | `dnd_vtt_backend/package.json` |
| Auth | `bcrypt`, `jsonwebtoken` / `@nestjs/jwt` | `dnd_vtt_backend/package.json` |
| Validation | `class-validator`, `class-transformer` (global `ValidationPipe`, `whitelist: true`, `transform: true`) | `dnd_vtt_backend/src/main.ts` |
| Uploads / images | `multer`, `sharp` | `dnd_vtt_backend/package.json` |
| Backend tests | Jest 30 + `ts-jest`, `supertest` for e2e | `dnd_vtt_backend/package.json` |
| Frontend tests | Vitest (`@angular/build:unit-test`), Playwright e2e | `dnd_vtt_frontend/package.json`, `angular.json` |
| Process manager (deploy) | PM2 (`ecosystem.config.js`, app name `dnd-vtt`) | `dnd_vtt_backend/ecosystem.config.js` |

Node.js 22 is the version used by every CI workflow and required by the Capacitor docs; `package.json` files declare no `engines` field.

Sources: `dnd_vtt_backend/package.json`, `dnd_vtt_frontend/package.json`, `dnd_vtt_frontend/angular.json`, `.github/workflows/ci.yml` (`node-version: 22`), [mobile/capacitor-development.md](mobile/capacitor-development.md).

## Repository layout

Three npm projects, none of them a workspace: the root `package.json` only holds orchestration scripts and `concurrently`.

```
.                         root package.json (dev/build/start scripts)
├── dnd_vtt_backend/      NestJS API, socket.io gateways, SQLite, static 5e content
│   ├── src/              feature modules (see below), main.ts, config.ts, app.module.ts
│   ├── content/          static game-content JSON and assets (backgrounds, classes, feats, icons,
│   │                     items, monsters, races, spells, subclasses, manifests)
│   ├── scripts/          maintenance / content-import scripts (*.mjs)
│   ├── test/             e2e tests (app.e2e-spec.ts, jest-e2e.json)
│   ├── data/             SQLite database location (default DB_PATH)
│   ├── uploads/          user-uploaded files served under /uploads
│   └── ecosystem.config.js   PM2 definition
├── dnd_vtt_frontend/     Angular app
│   ├── src/app/          core/, features/, shared/, app.routes.ts, app.config.ts
│   ├── e2e/              Playwright tests
│   ├── android/, ios/    Capacitor native projects
│   └── proxy.conf.json   dev-server proxy for /api, /uploads, /socket.io -> localhost:3000
├── avatar-assets/        avatar pack compiler (compile.mjs) run before frontend builds
├── parity-fixtures/      shared JSON fixtures (avatar-recipe, average-hp, content-sources, token-border)
├── docs/                 this documentation
├── .github/workflows/    ci.yml, deploy.yml, android-release.yml
└── CLAUDE.md, README.md, TODO.md, NOTICE.md, cline-tasks/   (not owned by docs/)
```

Backend modules under `dnd_vtt_backend/src/`: `auth`, `backgrounds`, `campaigns`, `characters`, `common`, `companions`, `content`, `encounters`, `maps`, `player`, `sessions`, `types`, `users`, `wiki`. `AppModule` imports `AuthModule`, `BackgroundsModule`, `CharactersModule`, `ContentModule`, `MapsModule`, `SessionsModule`, `EncountersModule`, `CampaignsModule`, `WikiModule`, `UsersModule`, `PlayerModule` (`companions` is not imported directly there). Socket.io gateways: `maps/tokens.gateway.ts`, `companions/companions.gateway.ts`, `encounters/encounter-presence.gateway.ts`.

Frontend feature folders under `dnd_vtt_frontend/src/app/features/`: `auth`, `battle-map`, `campaigns`, `characters`, `create-content`, `dashboard`, `dm`, `player`, `settings`, `shell`, `wiki`. Other top-level folders: `core/` (`avatar`, `guards`, `interceptors`, `models`, `services`, `utils`) and `shared/` (`components`, `directives`, `layout`).

Sources: `package.json`, `dnd_vtt_backend/src/app.module.ts`, `dnd_vtt_backend/src/`, `dnd_vtt_frontend/src/app/`, `dnd_vtt_frontend/proxy.conf.json`, `dnd_vtt_frontend/package.json` (`avatars:build`).

## How the server is wired

`main.ts` creates a `NestExpressApplication`, sets the global prefix `api`, a 1 MB JSON body limit, CORS from `CORS_ORIGINS`, and the global `ValidationPipe`. It then registers on the raw Express instance, in this order:

1. `/uploads/maps` returns 404 (raw map images are served only through authenticated map endpoints).
2. `/uploads` static from `./uploads` (relative to the process working directory).
3. `/icons` static from `./content/icons/svg`.
4. Static files from `../dnd_vtt_frontend/dist/dnd-app/browser/` (relative to the working directory, so the backend must be started from `dnd_vtt_backend/`).
5. SPA fallback: any path not starting with `/api` or `/socket.io` returns `index.html`.

The server listens on `PORT` (default `3000`) on `0.0.0.0`. With `DEV_BYPASS=true` the bearer token `dev` is accepted as the first admin and static files are sent with `Cache-Control: no-store`; never expose such a server. Environment variables are listed in `dnd_vtt_backend/.env.example` (names: `PORT`, `JWT_SECRET`, `CORS_ORIGINS`, `DB_PATH`); `DEV_BYPASS` and `NODE_ENV` are read from the environment too.

Sources: `dnd_vtt_backend/src/main.ts`, `dnd_vtt_backend/src/config.ts` (`corsOrigins`, `dbPath`, `isDevBypass`, `isDevRun`), `dnd_vtt_backend/.env.example`.

## Commands

The single source of truth for commands. All scripts are defined in the `package.json` files cited below.

### From the repo root

| Command | What it does |
|---|---|
| `npm run dev` | Runs `dev:api` (backend `start:dev`) and `dev:web` (frontend `watch`) concurrently |
| `npm run build` | Builds the frontend, then the backend |
| `npm start` | Runs the built backend (`start:prod`) |

### Backend (`dnd_vtt_backend/`)

| Command | What it does |
|---|---|
| `npm run start:dev` | `DEV_BYPASS=true nest start --watch` |
| `npm run start` | `nest start` (no dev bypass) |
| `npm run start:debug` | `nest start --debug --watch` |
| `npm run start:prod` | `NODE_ENV=production node dist/main` |
| `npm run build` | `nest build` into `dist/` |
| `npm run build:frontend` / `build:frontend:dev` / `build:all` | Build the frontend (prod / development config) and, for `build:all`, then the backend |
| `npm test` | Jest unit tests (`*.spec.ts` under `src/`); a single file: `npm test -- characters/characters.service.spec` |
| `npm run test:watch` / `test:cov` / `test:debug` | Jest in watch mode / with coverage / under the Node inspector |
| `npm run test:e2e` | Jest e2e tests using `test/jest-e2e.json` |
| `npm run lint:check` | ESLint without `--fix` |
| `npm run lint` | ESLint with `--fix` (modifies files) |
| `npm run format` | Prettier write on `src/**/*.ts` and `test/**/*.ts` |

### Frontend (`dnd_vtt_frontend/`)

| Command | What it does |
|---|---|
| `npm start` (`ng serve`) | Dev server on port 4200 using `proxy.conf.json` (needs the backend on port 3000) |
| `npm run build` | `ng build` into `dist/dnd-app/browser/` (the directory the backend serves) |
| `npm run build:dev` | `ng build --configuration development` |
| `npm run watch` | `ng build --watch --configuration development` |
| `npm test` | `ng test` (Vitest); CI runs `npm test -- --watch=false` |
| `npm run lint` | `ng lint` |
| `npm run format` / `format:check` | Prettier write / check on `src/**/*.{ts,html,scss}` |
| `npm run e2e` / `e2e:install` | Playwright tests / install Chromium for them |
| `npm run avatars:build` / `avatars:test` | Compile / test the avatar packs in `../avatar-assets`; `avatars:build` runs automatically before `build`, `build:dev` and `watch` |
| `npm run cap:sync`, `cap:open:android`, `cap:open:ios`, `cap:run:android`, `cap:run:ios`, `android:debug` | Capacitor helpers, see [mobile/capacitor-development.md](mobile/capacitor-development.md) |

The backend serves whatever is in `dnd_vtt_frontend/dist/dnd-app/browser/`; rebuild the frontend (or run `npm run dev`, which uses `watch`) for the backend to serve current frontend code. During active frontend work, `ng serve` on port 4200 against the backend on port 3000 avoids rebuilds.

### Backend scripts (`dnd_vtt_backend/scripts/`)

| Command | What it does |
|---|---|
| `node scripts/make-admin.mjs <email>` | Promotes a registered user to admin (DM) |
| `node scripts/download-monster-tokens.mjs` | Downloads monster token art into `uploads/monster-tokens/` |
| `node scripts/download-item-art.mjs` | Downloads item illustrations into `uploads/item-art/` |

Other scripts in that folder (`import-efa-content.mjs`, `import-phb-2024-spells.mjs`, `import-tce-content.mjs`, `import-xge-content.mjs`) import content; they are not covered here.

### First-time setup

1. `npm install` in `dnd_vtt_frontend/` and `dnd_vtt_backend/` (the root also has dev dependencies for `npm run dev`).
2. In `dnd_vtt_backend/`, copy `.env.example` to `.env` and fill in the variables.
3. `npm run dev` from the root; register in the app; then run `make-admin.mjs` for that email.

### CI

`.github/workflows/ci.yml` runs backend `npm test`, `npm run test:e2e`, `npm run build`, an ESLint check; and frontend `format:check`, `avatars:test`, an `avatars:build` plus generated-file diff check, `lint`, tests, `build`, a check that `ngsw.json` and `manifest.webmanifest` exist in the build output, and the Playwright e2e job. Deployment is `.github/workflows/deploy.yml` (builds both projects, then `pm2 startOrReload ecosystem.config.js`).

Sources: `package.json`, `dnd_vtt_backend/package.json`, `dnd_vtt_frontend/package.json`, `dnd_vtt_backend/scripts/`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `dnd_vtt_backend/ecosystem.config.js`.

## Where to go next

- Index of all docs: [README.md](README.md).
- Agent-oriented conventions: [CLAUDE.md](../CLAUDE.md).
- User-facing intro and API sketch: [README.md](../README.md) (repo root).
