# Documentation index: entry point listing every doc in `docs/` with its purpose.

Last updated: 2026-10-28 (commit 00cb49a)

Documented up to: 00cb49a91332c16055f404118cf1e48d95e372e4 (2026-10-26)

## Documents

| Doc | Purpose |
|---|---|
| [overview.md](overview.md) | What the app is, tech stack, repo layout, and the commands to run, build, test and lint |
| [architecture/backend.md](architecture/backend.md) | NestJS modules, bootstrapping (`main.ts`), request flow, shared helpers and conventions |
| [architecture/auth.md](architecture/auth.md) | JWT access and refresh tokens, `JwtGuard`, `AdminGuard`, `@Public()`, roles, `DEV_BYPASS`, socket auth |
| [architecture/storage.md](architecture/storage.md) | `DatabaseService` (SQLite), migrations and the no-v022 rule, uploads, content JSON loading |
| [architecture/realtime.md](architecture/realtime.md) | socket.io gateways: rooms, client and server events, authentication |
| [architecture/content.md](architecture/content.md) | Static game content (layout, loading, caching), content sources, homebrew, content endpoints |
| [architecture/frontend.md](architecture/frontend.md) | Angular bootstrapping, lazy routes and the `home` shell, guards, HTTP interceptor, state approach, folder map of `src/app/` |
| [architecture/frontend-core.md](architecture/frontend-core.md) | Every `core/` service, model, util and avatar file with a one-line purpose |
| [architecture/frontend-ui.md](architecture/frontend-ui.md) | `shared/` layout, components and directives; SCSS/Tailwind/Material styling; PWA service worker; Capacitor pointers |

### Features

| Doc | Purpose |
|---|---|
| [features/README.md](features/README.md) | Index mapping each feature doc to its frontend folders and backend modules |
| [features/accounts-and-settings.md](features/accounts-and-settings.md) | Register, sign in, Settings dialog (appearance, PWA install, admin user management) |
| [features/shell-and-dashboard.md](features/shell-and-dashboard.md) | Post-login shell, tabs, live encounter and level-up alerts, dashboard |
| [features/campaigns.md](features/campaigns.md) | Campaign list and join flow, DM hub, DM maps page, player hub, "current game" routes |
| [features/sessions-and-encounters.md](features/sessions-and-encounters.md) | Session pages, encounter form, DM encounter play, player join and rejoin, table screen |
| [features/battle-map.md](features/battle-map.md) | Konva battle map: tokens, fog, lighting, walls, measuring, move range, player perspective |
| [features/characters.md](features/characters.md) | Character list, play sheet, rests, inventory, spells, portraits, private notes |
| [features/character-wizard.md](features/character-wizard.md) | Character wizard steps, autosaved drafts, live preview, level-up mode |
| [features/companions.md](features/companions.md) | Primal Companion and Steel Defender |
| [features/wiki.md](features/wiki.md) | Campaign wiki: routes, embed, live-preview editor, organisation, visibility |
| [features/content-library.md](features/content-library.md) | Official content browser and homebrew monsters, items and spells |

### Data model

| Doc | Purpose |
|---|---|
| [data-model.md](data-model.md) | Every SQLite table after migrations v001–v036 (key columns, relationships, defining migration) and the shape of the character and campaign JSON `data` blobs |

### API

| Doc | Purpose |
|---|---|
| [api/README.md](api/README.md) | Index of the REST docs, shared conventions (prefix, auth, validation, errors) and the pointer to socket events |
| [api/auth.md](api/auth.md) | `/api/auth`: register, login, refresh, logout, current profile |
| [api/users.md](api/users.md) | `/api/users`: admin-only account management |
| [api/campaigns.md](api/campaigns.md) | `/api/campaigns`: CRUD, join codes, members, party level, current session |
| [api/sessions.md](api/sessions.md) | `/api/sessions`: CRUD, background upload, visibility |
| [api/encounters.md](api/encounters.md) | `/api/encounters`: CRUD, start/stop, turns, visibility, per-player levels |
| [api/maps.md](api/maps.md) | `/api/maps`: maps, tokens, movement, fog of war, lighting |
| [api/characters.md](api/characters.md) | `/api/characters`: CRUD, drafts, inventory, spells, rests, level-up, access rules |
| [api/companions.md](api/companions.md) | `/api/characters/:characterId/companions` |
| [api/content.md](api/content.md) | `/api/content`: static game content and homebrew monsters, items, spells |
| [api/wiki.md](api/wiki.md) | `/api/wiki`: pages, search, graph, uploads, character notes |
| [api/player.md](api/player.md) | `/api/player/bootstrap` |
| [api/backgrounds.md](api/backgrounds.md) | `/api/backgrounds`: list of app background images |

### Operations

| Doc | Purpose |
|---|---|
| [operations/configuration.md](operations/configuration.md) | Environment variable names for the backend, scripts, frontend build and tests, with purpose, default and required-or-not |
| [operations/deployment.md](operations/deployment.md) | Build and start, PM2 app `dnd-vtt`, Cloudflare Tunnel exposure, GitHub Actions CI, deploy and Android workflows |
| [operations/scripts.md](operations/scripts.md) | npm scripts (root, backend, frontend), `dnd_vtt_backend/scripts/`, avatar compiler, parity fixtures |
| [operations/troubleshooting.md](operations/troubleshooting.md) | Startup, dev bypass, unbuilt frontend, CORS, migration backups, stale session and CI failures, each traced to code |

### Changelog and decisions

| Doc | Purpose |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | What changed, newest first; starts with the documentation baseline |
| [decisions/README.md](decisions/README.md) | Index of architecture decision records 0001–0008 (SQLite, migrations, single origin, no v022, JSON character blob, token model, PWA/Capacitor, standalone components) |

### Mobile

Kept from before the documenter layout; verified against the code at commit 00cb49a (corrections and `(unverified)` marks are in each file).

| Doc | Purpose |
|---|---|
| [mobile/architecture.md](mobile/architecture.md) | How the mobile implementation relates to the single Angular app and NestJS backend |
| [mobile/capacitor-development.md](mobile/capacitor-development.md) | Capacitor requirements and development workflow |
| [mobile/pwa-installation.md](mobile/pwa-installation.md) | PWA installation and validation |
| [mobile/testing.md](mobile/testing.md) | Mobile test plan and evidence (dated 2026-08-16) |
| [mobile/implementation-audit.md](mobile/implementation-audit.md) | Mobile, PWA and Capacitor implementation audit (dated 2026-08-16) |

## Working documents

Owned by the user or other agents; the documenter reads and links them but does not edit them.

- [CLAUDE.md](../CLAUDE.md): instructions for coding agents
- [README.md](../README.md) (repo root): user-facing introduction
- [TODO.md](../TODO.md)
- [NOTICE.md](../NOTICE.md)
- [cline-tasks/](../cline-tasks/)

Sources: `docs/` (file listing), `git log -1` (commit 00cb49a).
