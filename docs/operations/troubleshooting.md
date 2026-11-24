# Troubleshooting: problems evidenced in the code, comments and CI, with cause and fix.

Last updated: 2026-10-28 (commit 00cb49a)

Each entry is derived from code behaviour or comments; none comes from a bug tracker.

## Backend refuses to start: `JWT_SECRET is missing or still a placeholder value`

Cause: `resolveJwtSecret` throws unless `JWT_SECRET` is set to a non-placeholder value, except in dev runs (`DEV_BYPASS=true`, `NODE_ENV=development` or `test`). This also applies to `npm run start` (no `NODE_ENV`) and `start:prod`.
Fix: set `JWT_SECRET` to a long random string in `dnd_vtt_backend/.env` ([configuration.md](configuration.md)). The three placeholder strings are rejected, including the one in older README examples.

Sources: `dnd_vtt_backend/src/auth/jwt-secret.ts`.

## `DEV_BYPASS=true` on a reachable server

Effect: bearer token `dev` is accepted as the first admin for REST and sockets; boot logs the warning `DEV_BYPASS=true: … Do not expose this server publicly`. `npm run start:dev` sets it automatically, so that mode must never sit behind the tunnel. Production uses `start:prod` or PM2, which do not set it. Check `.env` does not contain it.

Sources: `dnd_vtt_backend/src/config.ts` (`isDevBypass`), `dnd_vtt_backend/src/main.ts`, `dnd_vtt_backend/src/auth/jwt.guard.ts`, `dnd_vtt_backend/src/auth/socket-auth.service.ts`, `dnd_vtt_backend/package.json`.

## Browser shows a blank page or a 404 for `/`: frontend not built

Cause: the backend serves the frontend only from `dnd_vtt_frontend/dist/dnd-app/browser/`, resolved from the process working directory (`process.cwd()/../dnd_vtt_frontend/dist/dnd-app/browser`). If the build is missing, or the backend was started from another directory, `index.html` cannot be sent. The backend does not proxy to `ng serve`.
Fix: run the frontend build and start the backend from `dnd_vtt_backend/` ([deployment.md](deployment.md#build-and-start)). For live frontend work use `ng serve` on port 4200, which proxies to a backend on port 3000.

Sources: `dnd_vtt_backend/src/main.ts`, `dnd_vtt_frontend/proxy.conf.json`.

## Frontend changes do not show up in dev

With `DEV_BYPASS=true` static files are sent with `Cache-Control: no-store`; without it they are served with Express defaults. A frontend running as a PWA also has a service worker (`ngsw`), which can serve a cached build. This second point is inferred from CI verifying `ngsw.json`; the service-worker behaviour is described in [frontend-ui.md](../architecture/frontend-ui.md).

Sources: `dnd_vtt_backend/src/main.ts`, `.github/workflows/ci.yml` (`Verify PWA artifacts`).

## Browser or app cannot call the API: CORS

Cause: REST and both socket.io gateways accept only origins in `CORS_ORIGINS` (or the built-in default list). A new domain, or the Capacitor origins `https://localhost` and `capacitor://localhost`, must be in the list.
Fix: set `CORS_ORIGINS` to an exact comma-separated list including all of them.

Sources: `dnd_vtt_backend/src/config.ts` (`corsOrigins`, `corsOptions`).

## Native app talks to the wrong server

The production build uses an absolute host hard-coded in `environment.prod.ts` when running on a Capacitor native platform; it is not read from configuration. Edit that file and rebuild for another deployment.

Sources: `dnd_vtt_frontend/src/environments/environment.prod.ts`.

## `make-admin.mjs` fails

| Message | Cause |
|---|---|
| `Database not found at …` | No database at `DB_PATH`; start the backend once, or run the script from `dnd_vtt_backend/` / with the same `DB_PATH` |
| `No account found for "…"` | The user has not registered yet |

Sources: `dnd_vtt_backend/scripts/make-admin.mjs`.

## Deploy wiped the database or uploads

The deploy workflow must check out with `clean: false`; the default cleaning would delete the gitignored `data/`, `uploads/` and `.env`. Do not remove that option.

Sources: `.github/workflows/deploy.yml`, `.gitignore`.

## Large `.bak` files next to the database

Migration v035 (inventory) creates a backup of the database with `VACUUM INTO` at `<DB_PATH resolved>.pre-inventory-<timestamp>.bak` when there is at least one character row. It is not deleted automatically; remove it once the upgrade is verified. Migration v035 also reads `content/items/*.json` relative to the working directory, so start the backend from `dnd_vtt_backend/` when upgrading an old database. Schema versions: [storage architecture](../architecture/storage.md).

Sources: `dnd_vtt_backend/src/common/migrations/v035.ts`.

## Migration runner throws at startup

The runner throws if a migration does not stamp `PRAGMA user_version` to its own number, or if the registry is out of order; version 22 is intentionally skipped, so do not add a `v022`. See [storage architecture](../architecture/storage.md).

Sources: `CLAUDE.md` (Database paragraph), `dnd_vtt_backend/src/common/migrations/index.ts`.

## Reloading the page redirects to the dashboard

`staleSessionGuard` sends a logged-in user to `/dashboard` when the very first navigation after page load happens after more than one hour of inactivity. In-app navigation is unaffected.

Sources: `dnd_vtt_frontend/src/app/core/guards/stale-session.guard.ts`.

## Monster tokens or item art missing

`uploads/monster-tokens/` and `uploads/item-art/` are gitignored and not part of a checkout. Run the download scripts ([scripts.md](scripts.md)); only some items have art, and the rest keep their icon image.

Sources: `dnd_vtt_backend/scripts/download-monster-tokens.mjs`, `dnd_vtt_backend/scripts/download-item-art.mjs`, `.gitignore`.

## CI fails on generated avatar files

`ci.yml` runs `avatars:build` then `git diff --exit-code -- '*.generated.ts'`. If avatar packs changed without recompiling, commit the regenerated `*.generated.ts` files ([scripts.md](scripts.md#avatar-asset-tooling-avatar-assets)).

Sources: `.github/workflows/ci.yml`.
