# Deployment: how the app is built, run under PM2, exposed through a Cloudflare Tunnel, and tested and deployed by GitHub Actions.

Last updated: 2026-10-28 (commit 00cb49a)

## Runtime shape

One Node process serves the REST API (prefix `/api`), socket.io, `/uploads`, `/icons` and the built Angular app on a single port. `main.ts` resolves the frontend build at `../dnd_vtt_frontend/dist/dnd-app/browser/` relative to the process working directory, so the backend must be started from `dnd_vtt_backend/`. Non-`/api`, non-`/socket.io` requests fall back to `index.html`. `/uploads/maps` always returns 404 (map images are served through authenticated map endpoints). Build and start commands are listed in [overview.md](../overview.md).

Sources: `dnd_vtt_backend/src/main.ts`.

## Build and start

1. Frontend: `npm run build` in `dnd_vtt_frontend/` (runs `avatars:build` first through `prebuild`).
2. Backend: `npm run build` in `dnd_vtt_backend/` (`nest build` → `dist/`).
3. Start with `npm run start:prod` (`NODE_ENV=production node dist/main`), or under PM2.

The repository root `npm run build` and `npm start` chain these steps. Set the variables in [configuration.md](configuration.md) before starting; without a real `JWT_SECRET` outside dev mode the process refuses to start.

Sources: `package.json`, `dnd_vtt_backend/package.json`, `dnd_vtt_frontend/package.json`.

## PM2

`dnd_vtt_backend/ecosystem.config.js` defines one app:

| Field | Value |
|---|---|
| `name` | `dnd-vtt` |
| `script` | `dist/main.js` |
| `cwd` | the directory of the config file (`__dirname`) |
| `env` | `NODE_ENV=production`, `PORT=3030` |

`PORT` is set in the config, so production listens on 3030 while `npm run dev` uses the default 3000. Secrets (`JWT_SECRET`) are not in the PM2 file; they come from `dnd_vtt_backend/.env`, loaded by `ConfigModule`.

Sources: `dnd_vtt_backend/ecosystem.config.js`, `dnd_vtt_backend/src/app.module.ts`.

## Cloudflare Tunnel

The project is designed to run on one machine, with a Cloudflare Tunnel forwarding a public hostname to the local port; there is no separate frontend host. The repository contains no tunnel configuration (no `cloudflared` file, no Dockerfile); the tunnel is set up outside the repo. Repo facts relevant to it:

- The default `CORS_ORIGINS` list includes the production HTTPS origin, so a different domain requires setting `CORS_ORIGINS` ([configuration.md](configuration.md)).
- The native (Capacitor) build calls a hard-coded absolute host in `environment.prod.ts`.
- The refresh-token cookie is `secure` when `NODE_ENV=production`.

Sources: `CLAUDE.md` (Project section), `README.md` (architecture paragraph), `dnd_vtt_backend/src/config.ts`, `dnd_vtt_frontend/src/environments/environment.prod.ts`, `dnd_vtt_backend/src/auth/auth.controller.ts`.

## GitHub Actions

| Workflow | Trigger | Runner | What it does |
|---|---|---|---|
| `ci.yml` (CI) | `pull_request` to `main` | `ubuntu-latest`, Node 22 | Jobs: `backend-tests` (unit tests, e2e tests, build), `backend-lint` (`npx eslint`, not `npm run lint`, because that script uses `--fix`), `frontend-lint` (format check, avatar compiler tests, check that committed `*.generated.ts` avatar files are up to date, lint, unit tests, PWA build, check that `ngsw.json` and `manifest.webmanifest` exist and `ngsw.json` has no `dataGroups`), `mobile-tests` (Playwright with Chromium after building both projects) |
| `deploy.yml` (Deploy) | `push` to `main` | `self-hosted` | Checks out with `clean: false`, installs and builds frontend then backend (Node 22), then runs `npx --yes pm2@latest startOrReload ecosystem.config.js` in `dnd_vtt_backend/` |
| `android-release.yml` (Android Release Build) | `workflow_dispatch` (manual) | `ubuntu-latest`, Node 22, Temurin Java 21 | Builds the web app, runs `npx cap sync android`, runs `./gradlew assembleDebug` in `dnd_vtt_frontend/android`. The job is named "Android debug build" and publishes no artifact in the workflow file |

Deploy runs on a self-hosted runner, which is the machine that hosts the app. `clean: false` is mandatory there: the default checkout cleaning (`git clean -ffdx`) would delete the gitignored SQLite database (`dnd_vtt_backend/data/`), uploads and `.env` on that machine. The workflow does not run tests; CI runs only on pull requests.

Sources: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/android-release.yml`.

## State that must survive deploys

Gitignored paths holding live data: `dnd_vtt_backend/data/` (database), `dnd_vtt_backend/uploads/maps/`, `uploads/campaigns/`, `uploads/wiki/`, `uploads/monster-tokens/`, `uploads/item-art/`, and `dnd_vtt_backend/.env`. See [storage architecture](../architecture/storage.md).

Sources: `.gitignore`, `dnd_vtt_backend/.gitignore`.
