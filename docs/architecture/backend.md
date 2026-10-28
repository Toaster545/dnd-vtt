# Backend architecture: the NestJS modules, how the server boots, and how a request is handled.

Last updated: 2026-10-28 (commit 00cb49a)

The backend is one NestJS application in `dnd_vtt_backend/`. It serves the REST API, the socket.io gateways, uploaded files and the built Angular app from a single port. Commands to run it are in [overview.md](../overview.md).

Related: [auth](auth.md), [storage](storage.md), [realtime](realtime.md), [content](content.md).

## Bootstrapping

`bootstrap()` in `src/main.ts` runs these steps in order:

1. `NestFactory.create<NestExpressApplication>(AppModule)`.
2. If `isDevBypass()` is true, logs a warning that the `dev` bearer token is accepted as admin.
3. `setGlobalPrefix('api')`: every controller route is under `/api`.
4. JSON body limit raised to `1mb` (map wall sets from `.dd2vtt` imports can be large).
5. `enableCors(corsOptions())`. Allowed origins come from `CORS_ORIGINS` (comma-separated), with a built-in default list; `credentials: true`. The same options are passed to the socket.io gateways (see [realtime](realtime.md)). Defined in `src/config.ts`.
6. Global `ValidationPipe({ whitelist: true, transform: true })`: properties not declared on a DTO are stripped.
7. Static serving and SPA fallback, registered directly on the raw Express instance so Nest routing cannot intercept them. In this order:
   - `/uploads/maps` returns `404` for every request. Raw battle-map images are only served through authenticated map endpoints (`MapsService`).
   - `/uploads` serves `<cwd>/uploads`.
   - `/icons` serves `<cwd>/content/icons/svg`.
   - The built frontend from `<cwd>/../dnd_vtt_frontend/dist/dnd-app/browser/`. With `DEV_BYPASS=true` these responses get `Cache-Control: no-store`.
   - A final handler sends `index.html` for every path not starting with `/api` or `/socket.io`.
8. Listens on `PORT` (default `3000`) on `0.0.0.0`.

All paths are relative to `process.cwd()`, so the server must be started from `dnd_vtt_backend/`.

`src/common/spa.filter.ts` defines a `SpaFilter` exception filter, but no file registers it; the SPA fallback is the Express handler in `main.ts`.

Sources: `dnd_vtt_backend/src/main.ts` (`bootstrap`), `dnd_vtt_backend/src/config.ts` (`corsOptions`, `isDevBypass`), `dnd_vtt_backend/src/common/spa.filter.ts`.

## Configuration helpers

`src/config.ts` is the single place that reads environment-derived settings. Every function reads `process.env` lazily (because `ConfigModule` loads `.env` while `AppModule` is imported).

| Function | Reads | Meaning |
|---|---|---|
| `corsOrigins()` / `corsOptions()` | `CORS_ORIGINS` | Allowed origins for REST and socket.io |
| `dbPath()` | `DB_PATH` | SQLite file path, default `./data/dnd.db` |
| `isDevBypass()` | `DEV_BYPASS` | True only when it equals `true` |
| `isDevRun()` | `DEV_BYPASS`, `NODE_ENV` | True for `DEV_BYPASS=true` or `NODE_ENV` `development`/`test`; only used by the JWT secret fallback |
| `isProduction()` | `NODE_ENV` | True when `production`; makes the refresh cookie `secure` |

Other variables read in the backend: `PORT` (`main.ts`), `JWT_SECRET` (`src/auth/jwt-secret.ts`). The full list for operators belongs in the operations docs.

Sources: `dnd_vtt_backend/src/config.ts`, `dnd_vtt_backend/src/auth/jwt-secret.ts`, `dnd_vtt_backend/src/app.module.ts` (`ConfigModule.forRoot({ isGlobal: true })`).

## Modules

`AppModule` imports `ConfigModule` (global) and eleven feature modules. Each module follows the controller / service / module pattern; the two modules with gateways are noted.

| Module (folder `src/…`) | Controller route prefix | Purpose | Imports |
|---|---|---|---|
| `auth` (`AuthModule`) | `auth` | Register, login, refresh, logout, `me`; provides `JwtGuard`, `AdminGuard`, `SocketAuthService`, `DatabaseService`, `CampaignAccessService`, `JwtModule` | `JwtModule` |
| `backgrounds` (`BackgroundsModule`) | `backgrounds` | Lists image files in `uploads/backgrounds/` (unauthenticated `GET`) | none |
| `characters` (`CharactersModule`) | `characters`, and `characters/:characterId/companions` | Character CRUD on the JSON `data` blob, inventory, portraits; also hosts `CompanionsController` | `AuthModule`, `ContentModule`, `EncountersModule`, `CompanionsModule` |
| `content` (`ContentModule`) | `content` | Static game content plus homebrew monsters, items, spells; see [content](content.md) | `AuthModule` |
| `maps` (`MapsModule`) | `maps` | Battle maps, tokens, fog, lighting; `TokensGateway` | `AuthModule`, `ContentModule`, `CompanionsModule` |
| `sessions` (`SessionsModule`) | `sessions` | Campaign sessions | `AuthModule` |
| `encounters` (`EncountersModule`) | `encounters` | Encounters, levels, turn order; `EncounterPresenceGateway` | `AuthModule`, `MapsModule`, `CompanionsModule` |
| `campaigns` (`CampaignsModule`) | `campaigns` | Campaigns, join codes, membership | `AuthModule`, `EncountersModule` |
| `wiki` (`WikiModule`) | `wiki` | Per-campaign wiki pages, links, images | `AuthModule` |
| `users` (`UsersModule`) | `users` | Admin-only user management | `AuthModule` |
| `player` (`PlayerModule`) | `player` | `GET /player/bootstrap` aggregate for the player shell | `AuthModule`, `CampaignsModule` |
| `companions` (`CompanionsModule`) | none (controller is registered in `CharactersModule`) | Companion rules and service; `CompanionsGateway`; exports `CompanionsService` | `AuthModule` |

Endpoint-level detail belongs in the API docs. Each module's files: a `*.controller.ts`, `*.service.ts`, `*.module.ts`, a `dto/` folder where request bodies exist, and colocated `*.spec.ts` tests. Non-obvious files:

| Module | Notable files |
|---|---|
| `auth` | `jwt-secret.ts` (secret resolution), `socket-auth.service.ts` (socket handshake auth), `public.decorator.ts` |
| `campaigns` | `campaign-access.service.ts` (visibility rules shared by REST and sockets, provided by `AuthModule`), `campaign-data.ts` |
| `characters` | `character-repository.ts`, `character-rest.service.ts`, `character-data.ts`, `inventory.service.ts`, `inventory-rules.ts`, `average-hp.ts` |
| `companions` | `companion-rules.ts`, `companions.gateway.ts` |
| `maps` | `movement.ts`, `player-tokens.ts` (redacts tokens for players), `token-row.ts` |
| `common` | Shared helpers, see below |
| `types` | `express.d.ts` augments the Express `Request` with `user?: RequestUser` |

Module dependency notes:

- `CampaignAccessService`, `DatabaseService` and `SocketAuthService` are provided by `AuthModule` and exported, so every module that imports `AuthModule` can inject them. `DatabaseService` is therefore a provider of `AuthModule`; its `onModuleInit` runs the migrations once at startup (see [storage](storage.md)).
- `TokensGateway` takes `CompanionsService` as `@Optional()`.
- `MapsModule` and `EncountersModule` export their gateways so services in other modules can broadcast.

Sources: `dnd_vtt_backend/src/app.module.ts`, `dnd_vtt_backend/src/*/*.module.ts`, `dnd_vtt_backend/src/maps/tokens.gateway.ts` (`@Optional()`).

## Request flow

1. Express receives the request. `/uploads`, `/icons`, static frontend files and the SPA fallback are handled before Nest (see Bootstrapping).
2. Requests under `/api` reach Nest. CORS, body parsing (`1mb` JSON), then the route's guards.
3. `JwtGuard` (class-level `@UseGuards(JwtGuard)` on each controller) authenticates the bearer token and sets `req.user`. See [auth](auth.md).
4. Optional `AdminGuard` for admin-only controllers (`users`).
5. The global `ValidationPipe` validates and transforms DTO bodies.
6. The controller reads the user with `@CurrentUser()` (`src/common/current-user.decorator.ts`) and calls its service.
7. The service queries SQLite through `DatabaseService.execute` and applies ownership checks (`campaign.dm_id === user.id`) or `CampaignAccessService` checks. Services throw Nest `HttpException`s.
8. Mutations that affect live viewers call a gateway broadcast method (see [realtime](realtime.md)).

File uploads use `FileInterceptor('file')` (multer, in-memory buffer). Handlers: campaign image, session image, map image, wiki image (limit 10 MiB), character portrait (limit 2 MiB), item image. Files are written under `<cwd>/uploads/<subdir>/` as `<Date.now()>_<original name with whitespace replaced by _>` by `saveUploadedImage` or an equivalent inline write; see [storage](storage.md).

Sources: `dnd_vtt_backend/src/auth/jwt.guard.ts`, `dnd_vtt_backend/src/common/current-user.decorator.ts`, `dnd_vtt_backend/src/*/*.controller.ts` (`FileInterceptor`).

## Conventions

- **Authorization styles** (documented in the comment on `AdminGuard`): `JwtGuard` for "logged in"; `AdminGuard` for app-wide admin actions (user management); ownership checks in services for everything campaign-scoped, so any registered user can DM their own campaign. `sessions`, `encounters` and `campaigns` controllers deliberately have no `AdminGuard`. One inline `user.role === 'admin'` check remains in `MapsService` for the legacy `default` campaign.
- **Websocket errors:** gateway-side checks go through `wsGuard` (`src/common/ws-guard.ts`), which converts `HttpException` into a `WsException({ status, message })`.
- **Open-ended JSON bodies:** the character endpoints use `ValidateOnlyPipe` (`src/common/validate-only.pipe.ts`). It validates the typed fields of a DTO but passes the original body through, because the global `whitelist: true` would strip unknown keys.
- **No ORM:** raw SQL strings via `DatabaseService`; JSON columns are parsed with `DatabaseService.parseJson`.
- **Style:** single quotes and trailing commas (`dnd_vtt_backend/.prettierrc`).
- **Tests:** unit tests are `*.spec.ts` colocated in `src/`; `src/test-setup.ts` (silences the Nest logger) and `src/common/test-db.util.ts` (sets `DB_PATH=:memory:`) support them. Content-schema tests live in `src/content/`.

`src/common/` contents:

| File | Purpose |
|---|---|
| `database.service.ts` | SQLite client and migration runner |
| `migrations/` | `vNNN.ts` migrations, `index.ts` registry, `migration.ts` types |
| `current-user.decorator.ts` | `RequestUser` and `@CurrentUser()` |
| `ws-guard.ts` | HTTP-to-WS exception conversion |
| `validate-only.pipe.ts` | Validation without stripping |
| `upload.util.ts` | `saveUploadedImage` |
| `spa.filter.ts` | Unused SPA exception filter |
| `ability.ts`, `arrays.ts`, `join-code.util.ts`, `item-display-name.ts`, `character-lock.ts`, `set-enabled.dto.ts`, `set-visible.dto.ts` | Shared helpers and DTOs |
| `avatar-recipe.ts`, `portrait-image.ts`, `token-border.ts`, `avatar-manifest.generated.ts`, `custom-avatar-manifest.generated.ts` | Character avatar, portrait and token-border parsing and generated manifests |
| `test-db.util.ts`, `test-fixtures.util.ts` | Test support |

Sources: `dnd_vtt_backend/src/auth/admin.guard.ts`, `dnd_vtt_backend/src/common/`, `dnd_vtt_backend/.prettierrc`.
