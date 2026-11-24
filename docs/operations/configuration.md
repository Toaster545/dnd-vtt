# Configuration: every environment variable the backend, frontend build, scripts and CI read (names only, no values).

Last updated: 2026-10-28 (commit 00cb49a)

## Where configuration comes from

`ConfigModule.forRoot({ isGlobal: true })` in `AppModule` loads `dnd_vtt_backend/.env` into `process.env`. `src/config.ts` reads `process.env` lazily through functions (`corsOrigins`, `corsOptions`, `dbPath`, `isDevBypass`, `isDevRun`, `isProduction`). `.env` is gitignored; `dnd_vtt_backend/.env.example` lists the variables a deployer sets. No value is recorded in these docs.

Sources: `dnd_vtt_backend/src/app.module.ts`, `dnd_vtt_backend/src/config.ts`, `dnd_vtt_backend/.env.example`, `.gitignore`, `dnd_vtt_backend/.gitignore`.

## Backend variables

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `PORT` | TCP port the HTTP and socket.io server listens on (host `0.0.0.0`). | `3000` (`main.ts`); `ecosystem.config.js` sets a different port for the PM2 app | No |
| `JWT_SECRET` | Signing secret for access tokens (`resolveJwtSecret`). Missing, or one of three known placeholder strings, makes startup throw unless the run is a dev run (`DEV_BYPASS=true` or `NODE_ENV=development\|test`), where a built-in fallback is used. | none | **Yes** outside dev/test |
| `CORS_ORIGINS` | Comma-separated allowed origins, used for REST CORS and both socket.io gateways. Entries are trimmed. | Built-in list: local Angular dev server, the production domain, and the Capacitor origins `https://localhost` and `capacitor://localhost` | No |
| `DB_PATH` | SQLite file path. Also read by `scripts/make-admin.mjs`. | `./data/dnd.db` (relative to the working directory) | No |
| `DEV_BYPASS` | Exactly `true` enables the bearer token `dev` (resolves to the first admin) for REST and sockets, logs a warning at boot, and serves frontend static files with `Cache-Control: no-store`. Set by `npm run start:dev`. | unset | No; never in production |
| `NODE_ENV` | `production` makes the refresh-token cookie `secure` (`isProduction`). `development` or `test` allow the `JWT_SECRET` fallback. Set to `production` by `npm run start:prod` and by `ecosystem.config.js`. | unset | No |

Notes:
- The `.env.example` file lists `PORT`, `JWT_SECRET`, `CORS_ORIGINS` and `DB_PATH` only.
- `DEV_BYPASS` does not read `NODE_ENV`; `isDevRun` is broader than `isDevBypass` and only affects the `JWT_SECRET` fallback. See [auth architecture](../architecture/auth.md).
- The access token lifetime (`15m`) is hard-coded in `AuthModule`, not configurable.

Sources: `dnd_vtt_backend/src/config.ts`, `dnd_vtt_backend/src/auth/jwt-secret.ts`, `dnd_vtt_backend/src/auth/auth.module.ts`, `dnd_vtt_backend/src/auth/auth.controller.ts` (`isProduction`), `dnd_vtt_backend/src/auth/jwt.guard.ts`, `dnd_vtt_backend/src/auth/socket-auth.service.ts`, `dnd_vtt_backend/src/main.ts`, `dnd_vtt_backend/ecosystem.config.js`, `dnd_vtt_backend/package.json` (`start:dev`, `start:prod`).

## Script variables

| Variable | Used by | Purpose | Default |
|---|---|---|---|
| `DB_PATH` | `dnd_vtt_backend/scripts/make-admin.mjs` | Database to promote the user in | `./data/dnd.db` |

The other scripts take arguments, not environment variables; see [scripts.md](scripts.md).

Sources: `dnd_vtt_backend/scripts/make-admin.mjs`.

## Frontend build configuration

The frontend reads no `.env`. Build-time values are in `src/environments/`; the production build swaps `environment.ts` for `environment.prod.ts` via `fileReplacements` in `angular.json`.

| Key | `environment.ts` (dev) | `environment.prod.ts` |
|---|---|---|
| `production` | `false` | `true` |
| `apiUrl` | `/api` | `/api` in a browser; an absolute `https://…/api` URL on Capacitor native platforms |
| `wsUrl` | `/` | `/` in a browser; the absolute site URL on native platforms |
| `devBypass` | `false` | `false` |

The native-platform host is hard-coded in `environment.prod.ts`; changing it for another deployment means editing that file. `ng serve` proxies `/api`, `/uploads` and `/socket.io` (with `ws`) to `http://localhost:3000` through `proxy.conf.json`. Capacitor settings (`appId`, `appName`, `webDir`) are in `capacitor.config.ts`; see [mobile docs](../mobile/capacitor-development.md).

Sources: `dnd_vtt_frontend/src/environments/environment.ts`, `dnd_vtt_frontend/src/environments/environment.prod.ts`, `dnd_vtt_frontend/angular.json` (`fileReplacements`), `dnd_vtt_frontend/proxy.conf.json`, `dnd_vtt_frontend/capacitor.config.ts`.

## Test and CI variables

| Variable | Read by | Effect |
|---|---|---|
| `CI` | `dnd_vtt_frontend/playwright.config.ts` | Two retries, `github` reporter, and no reuse of an already-running server when set |
| `PW_EXTERNAL_SERVER` | `playwright.config.ts` | When set, Playwright does not start its own backend |
| `JWT_SECRET` | `playwright.config.ts` | Passed through if set; otherwise a test-only placeholder is injected |
| `PORT`, `DB_PATH` | `playwright.config.ts` | Overridden for the Playwright-started backend (separate port and a database under `test-results/`) |
| `DB_PATH`, `JWT_SECRET`, `DEV_BYPASS` | `dnd_vtt_backend/test/app.e2e-spec.ts`, `src/common/test-db.util.ts`, specs | Set or cleared per test run (in-memory database) |

The GitHub workflows define no `env:` or secret references (checked in `ci.yml`, `deploy.yml`, `android-release.yml`). No Dockerfile exists in the repository.

Sources: `dnd_vtt_frontend/playwright.config.ts`, `dnd_vtt_backend/test/app.e2e-spec.ts`, `dnd_vtt_backend/src/common/test-db.util.ts`, `.github/workflows/`.
