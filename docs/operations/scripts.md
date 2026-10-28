# Scripts: every runnable script (npm scripts, backend `scripts/`, avatar compiler) and what it does.

Last updated: 2026-10-28 (commit 00cb49a)

## Root `package.json`

| Script | Runs |
|---|---|
| `npm run dev` | `dev:api` and `dev:web` concurrently (`concurrently`) |
| `npm run dev:api` | `npm run start:dev` in `dnd_vtt_backend` |
| `npm run dev:web` | `npm run watch` in `dnd_vtt_frontend` |
| `npm run build` | frontend `npm run build`, then backend `npm run build` |
| `npm start` | `npm run start:prod` in `dnd_vtt_backend` |

Sources: `package.json`.

## Backend `package.json` (`dnd_vtt_backend/`)

| Script | Command / effect |
|---|---|
| `build` | `nest build` → `dist/` |
| `build:frontend`, `build:frontend:dev` | Build the frontend (`npm run build` / `build:dev`) from `../dnd_vtt_frontend` |
| `build:all` | `build:frontend` then `build` |
| `start` | `nest start` (no dev bypass, no `NODE_ENV`) |
| `start:dev` | `DEV_BYPASS=true nest start --watch` |
| `start:debug` | `nest start --debug --watch` |
| `start:prod` | `NODE_ENV=production node dist/main` |
| `format` | Prettier write on `src/**/*.ts` and `test/**/*.ts` |
| `lint` | ESLint with `--fix` (modifies files) |
| `lint:check` | ESLint without `--fix` |
| `test`, `test:watch`, `test:cov`, `test:debug` | Jest unit tests (watch, coverage, `--inspect-brk` with `--runInBand`) |
| `test:e2e` | Jest with `test/jest-e2e.json` |

Sources: `dnd_vtt_backend/package.json`.

## Frontend `package.json` (`dnd_vtt_frontend/`)

| Script | Effect |
|---|---|
| `start` | `ng serve` (dev server, proxy per `proxy.conf.json`) |
| `build` | `ng build` → `dist/dnd-app/browser/` (production configuration) |
| `build:dev` | `ng build --configuration development` |
| `watch` | `ng build --watch --configuration development` |
| `avatars:build` | `node ../avatar-assets/compile.mjs` (see below) |
| `avatars:test` | `node --test ../avatar-assets/compiler.test.mjs` |
| `prebuild`, `prebuild:dev`, `prewatch` | Run `avatars:build` automatically before `build`, `build:dev` and `watch` |
| `test` | `ng test` (Vitest per project docs) |
| `lint` | `ng lint` |
| `format`, `format:check` | Prettier write / check on `src/**/*.{ts,html,scss}` |
| `e2e`, `e2e:install` | `playwright test`; `playwright install --with-deps chromium` |
| `cap:sync` | `npm run build && cap sync` |
| `cap:open:android`, `cap:open:ios`, `cap:run:android`, `cap:run:ios` | Matching `cap open` / `cap run` commands |
| `android:debug` | Build, `cap sync android`, then `gradlew.bat assembleDebug` in `android/` (Windows batch file) |

Sources: `dnd_vtt_frontend/package.json`.

## Backend `scripts/` (run from `dnd_vtt_backend/`)

All are ES-module Node scripts. Content importers resolve `content/` relative to the working directory, so run them from `dnd_vtt_backend/`.

| Script | Usage | What it does |
|---|---|---|
| `make-admin.mjs` | `node scripts/make-admin.mjs <email>` | Opens the SQLite file at `DB_PATH` (default `./data/dnd.db`) and promotes the `profiles` row with that email to admin. Exits with an error if the database file does not exist (start the backend once first) or no account has that email (register first) |
| `download-monster-tokens.mjs` | `node scripts/download-monster-tokens.mjs [--force]` | Downloads monster token art from a 5etools image mirror into `uploads/monster-tokens/<index>.webp` (via `sharp`); monsters with no token get a generated token from a game-icons.net icon where one is listed. Output is gitignored; re-run on a fresh checkout |
| `download-item-art.mjs` | `node scripts/download-item-art.mjs [--force]` | Downloads item illustrations into `uploads/item-art/<item index>.webp`, served as `art_url`. Output is gitignored; only some items have art |
| `import-tce-content.mjs` | `… <5etools-src-data-directory>` | Imports Tasha's Cauldron of Everything content into `content/` JSON files |
| `import-xge-content.mjs` | `… <5etools-2014-src-data-directory>` | Imports Xanathar's Guide to Everything content into `content/` |
| `import-efa-content.mjs` | `… <races.json> <backgrounds.json> <feats.json> <items.json> <magicvariants.json> <bestiary-efa.json>` | Imports races, backgrounds, feats, items, magic variants and bestiary entries for the EFA source into `content/` |
| `import-phb-2024-spells.mjs` | `… <spells-xphb.json> <srd-5.2-spells.json>` | Generates 2024 spell JSON files in `content/` from the two inputs |

Supporting files: `scripts/lib/item-runtime-metadata.mjs` and `scripts/lib/magic-item-content.mjs` (helpers imported by importers), `scripts/tce-subclass-features.json`, `scripts/xge-subclass-features.json` and `scripts/reference-only-spell-summaries.json` (data inputs). The importers take raw 5etools data supplied by the operator; the repository does not contain it. Content layout: [content architecture](../architecture/content.md).

Sources: `dnd_vtt_backend/scripts/*.mjs`, `dnd_vtt_backend/scripts/lib/`.

## Avatar asset tooling (`avatar-assets/`)

`avatar-assets/compile.mjs` compiles the SVG packs in `avatar-assets/packs/` (using `compile-lib.mjs`) into two committed generated files: `dnd_vtt_frontend/src/app/core/avatar/custom-avatar-assets.generated.ts` and `dnd_vtt_backend/src/common/custom-avatar-manifest.generated.ts`. It runs automatically before frontend builds and watch. CI fails when the generated files differ from a fresh compile ([deployment.md](deployment.md#github-actions)). `compiler.test.mjs` holds its tests (`npm run avatars:test`). Pack authoring rules (layers, colour slots, rejected SVG features, 200 KB limit) are in `avatar-assets/README.md`.

Sources: `avatar-assets/compile.mjs`, `avatar-assets/compile-lib.mjs`, `avatar-assets/compiler.test.mjs`, `avatar-assets/README.md`, `.github/workflows/ci.yml`.

## Parity fixtures

`parity-fixtures/*.json` (`avatar-recipe`, `average-hp`, `content-sources`, `token-border`) are shared inputs read by `dnd_vtt_backend/src/common/parity.spec.ts` and `dnd_vtt_frontend/src/app/core/utils/parity.spec.ts`; they are not scripts.

Sources: `parity-fixtures/`, the two `parity.spec.ts` files.
