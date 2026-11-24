# Frontend architecture: bootstrapping, routing, guards, interceptor, state approach and the `src/app/` folder map of the Angular app.

Last updated: 2026-10-28 (commit 00cb49a)

The frontend is the Angular app in `dnd_vtt_frontend/` (project name `dnd-app`). It is built into `dnd_vtt_frontend/dist/dnd-app/browser/`, which the backend serves (see [backend.md](backend.md)). Build and dev commands are listed in [../overview.md](../overview.md). Related docs: [frontend-core.md](frontend-core.md) (services, models, utils) and [frontend-ui.md](frontend-ui.md) (shared components, styling, PWA).

## Bootstrapping

- `src/main.ts` calls `bootstrapApplication(App, appConfig)`. There are no NgModules; every component is standalone.
- `src/app/app.config.ts` (`appConfig`) provides:

| Provider | Setting |
|---|---|
| `provideBrowserGlobalErrorListeners()` | default |
| `provideRouter(routes)` | routes from `app.routes.ts` |
| `provideHttpClient(withInterceptors([authInterceptor]))` | one functional interceptor |
| `provideAnimationsAsync()` | lazy-loaded animations |
| `provideServiceWorker('ngsw-worker.js', …)` | enabled only when `environment.production` and not `Capacitor.isNativePlatform()`; `registrationStrategy: 'registerWhenStable:30000'` |

- `src/app/app.ts` (`App`, selector `app-root`) has an inline template: an `.app-bg-overlay` div, a connection banner driven by `PwaService.online()` / `reconnecting()`, and `<router-outlet />`. The constructor-time injection of `BackgroundService`, `ColorSchemeService`, `UiScaleService` and `NativeLifecycleService` is what starts those services; they have no other caller at startup.
- `src/app/app.html` and `src/app/app.scss` are not referenced by `App` (it uses an inline template); `app.html` is the unmodified Angular placeholder template and `app.scss` is empty.
- `src/index.html` holds `<app-root>`, the PWA/mobile meta tags and the manifest link; `<body>` carries `bg-canvas text-parchment font-body`.
- Environments: `src/environments/environment.ts` (`apiUrl: '/api'`, `wsUrl: '/'`, `devBypass: false`) is replaced by `environment.prod.ts` in the `production` build configuration (`angular.json` `fileReplacements`). In the production file, `apiUrl`/`wsUrl` point at a fixed absolute host when `Capacitor.isNativePlatform()` and at the same origin otherwise.
- Dev server: `ng serve` proxies `/api`, `/uploads` and `/socket.io` (with `ws: true`) to `http://localhost:3000` (`proxy.conf.json`).

Sources: `dnd_vtt_frontend/src/main.ts`, `src/app/app.config.ts`, `src/app/app.ts`, `src/app/app.html`, `src/index.html`, `src/environments/environment.ts`, `src/environments/environment.prod.ts`, `angular.json`, `proxy.conf.json`.

## Routing

All routes are in `src/app/app.routes.ts`. Every page component is loaded with `loadComponent: () => import(...)` (one lazy chunk per component). There is no role-based route split: which campaign view a user reaches is decided by ownership in `features/campaigns/campaigns.ts` (`CampaignsComponent`), and the backend enforces permissions per endpoint.

### Top-level routes

| Path | Guards | Target |
|---|---|---|
| `''` and `**` | `homeRedirectGuard` | redirect only (`children: []`) |
| `auth/login`, `auth/register` | none | `LoginComponent`, `RegisterComponent` |
| `dashboard` | none | `redirectTo: 'home/dashboard'` |
| `battle-map`, `battle-map/:id` | `authGuard`, `staleSessionGuard` | `BattleMapComponent` |
| `encounters/:encounterId/player-view` | `authGuard`, `staleSessionGuard` | `PlayerViewComponent` (`data.bgOverlay: 1`) |
| `home` | `authGuard`, `staleSessionGuard` | `ShellComponent` with the children below |

### Children of `home` (shell routes)

| Path (under `/home`) | Component | Extra route `data` |
|---|---|---|
| `''` | redirect to `characters` | |
| `dashboard` | `DashboardComponent` | `bgOverlay: 0.6` |
| `characters` | `CharactersComponent` | |
| `characters/new` | `CharacterWizardPageComponent` | `bgOverlay: 0.6` |
| `characters/:id/edit` | `CharacterWizardPageComponent` | `bgOverlay: 0.9` |
| `characters/:id/level-up` | `CharacterLevelUpPageComponent` (guard `levelUpPendingGuard`) | `bgOverlay: 0.9` |
| `characters/:id` | `CharacterSheetPageComponent` | `bgOverlay: 0.9` |
| `campaign/current`, `campaign/current-session`, `campaign/current-encounter`, `campaign/current-map` | `CurrentPlayerRouteComponent` | `target`: `campaign` / `session` / `encounter` / `map`; `bgOverlay` 0.9 / 0.9 / 1 / 1 |
| `campaigns` | `CampaignsComponent` | |
| `campaigns/manage/:campaignId` | `DmCampaignHubComponent` | `bgOverlay: 0.9` |
| `campaigns/manage/:campaignId/maps` | `DmCampaignMapsComponent` | `bgOverlay: 0.9` |
| `campaigns/manage/:campaignId/wiki`, `…/wiki/:slug` | `WikiComponent` | `wikiDm: true`, `bgOverlay: 0.95` |
| `campaigns/manage/:campaignId/sessions/:sessionId` | `DmCampaignSessionComponent` | `bgOverlay: 0.9` |
| `campaigns/manage/:campaignId/sessions/:sessionId/encounters/:encounterId` | `DmEncounterPlayComponent` | `bgOverlay: 1` |
| `campaigns/:campaignId` | `PlayerCampaignHubComponent` | `bgOverlay: 0.9` |
| `campaigns/:campaignId/wiki`, `…/wiki/:slug` | `WikiComponent` | `wikiDm: false`, `bgOverlay: 0.95` |
| `campaigns/:campaignId/sessions/:sessionId` | `PlayerCampaignSessionComponent` | |
| `content-library` | `CreateContentComponent` | |

`data.bgOverlay` (number) is read by `BackgroundService` on each navigation and written to the CSS custom property `--app-bg-overlay-alpha`; the property is removed when a route has none. `data.wikiDm` tells `WikiComponent` which side (DM or player) it is rendering. `data.target` tells `CurrentPlayerRouteComponent` where to send the player.

### The `home` shell

`features/shell/shell.ts` (`ShellComponent`) is the single post-login layout: `MainLayoutComponent` + `AppHeaderComponent` around one `<router-outlet>`. Its `activeTab` signal (`dashboard`, `characters`, `campaigns`, `content-library`) is derived from the URL and only highlights the header tab. The Settings dialog (`features/settings/settings-dialog.ts`, `SettingsDialogComponent`) is opened from the header via `MatDialog`. The shell also shows two dismissible banners fed by `EncounterService` events: an encounter started in a joined campaign (`liveAlert`) and a party level-up (`levelUpAlert`).

Sources: `dnd_vtt_frontend/src/app/app.routes.ts`, `src/app/features/shell/shell.ts`, `src/app/core/services/background.service.ts` (`bgOverlay` handling), `src/app/features/campaigns/campaigns.ts`.

## Guards

All are functional `CanActivateFn`s in `src/app/core/guards/`. The first three wait for `AuthService.ready` (the session-restore promise) before deciding.

| Guard | Behaviour |
|---|---|
| `authGuard` (`auth.guard.ts`) | Allows when `AuthService.isLoggedIn()`; otherwise redirects to `/auth/login`. |
| `homeRedirectGuard` (`home-redirect.guard.ts`) | Used on `''` and `**`: logged out → `/auth/login`, logged in → `/home/dashboard`. |
| `staleSessionGuard` (`stale-session.guard.ts`) | Skips when logged out. If this is the first navigation since bootstrap (`getCurrentNavigation().id === 1`) and `ActivityService.isStale(1 hour)`, redirects to `/dashboard` (which redirects to `/home/dashboard`). Always calls `ActivityService.touch()`. |
| `levelUpPendingGuard` (`level-up-pending.guard.ts`) | Async. Fetches the character via `CharacterService.getCharacter`; allows when `applied_level` is null or below `level`; otherwise redirects to `/home/characters/:id`. Missing id or fetch error → `/home/characters`. |

Sources: `dnd_vtt_frontend/src/app/core/guards/*.ts`, `src/app/core/services/activity.service.ts`.

## HTTP interceptor

`src/app/core/interceptors/auth.interceptor.ts` (`authInterceptor`, registered in `app.config.ts`):

1. Adds `Authorization: Bearer <token>` from `AuthTokenService.accessToken()` when a token is held.
2. Sets `withCredentials: true` on every request (carries the refresh cookie for web clients).
3. On a `401` for any URL other than `/auth/login` and `/auth/refresh`, calls `AuthTokenService.refresh()` once and retries the request with the new access token; if no session results, the original error is rethrown.

Token storage and refresh details are in [frontend-core.md](frontend-core.md#auth-services); the server side is in [auth.md](auth.md).

Sources: `dnd_vtt_frontend/src/app/core/interceptors/auth.interceptor.ts`, `src/app/core/services/auth-token.service.ts`.

## State and data approach

- State lives in `providedIn: 'root'` services; there is no store library. Services hold Angular `signal`s (e.g. `AuthService.profile`, `PwaService.online`, `PlayerContextService.state`) and expose them read-only via `asReadonly()` or `computed`.
- One-shot HTTP calls are `async` methods wrapping `firstValueFrom(this.http…)` (e.g. `SessionService`, `BattleMapService`). `HttpClient` is used from `core/services`; see the conventions in [CLAUDE.md](../../CLAUDE.md).
- `ContentService` caches static content responses in a per-session `Map`; custom content writes (`MonsterService`, `ItemService`, `SpellService`) must call `ContentService.invalidateContent`.
- Live updates use `SocketService` (socket.io client, `autoConnect: false`, auth token passed in `socket.auth`). Event names are documented in [realtime.md](realtime.md).
- Browser storage: keys shared between files are in `core/utils/storage-keys.ts`; services such as `ColorSchemeService`, `BackgroundService`, `UiScaleService`, `ActivityService`, `RecentActivityService`, `PlayerContextService` keep their own keys in `localStorage`.

Sources: `dnd_vtt_frontend/src/app/core/services/*.service.ts`, `src/app/core/utils/storage-keys.ts`.

## Folder map of `src/app/`

| Folder | Contents | Documented in |
|---|---|---|
| `core/guards` | route guards | [Guards](#guards) |
| `core/interceptors` | `auth.interceptor.ts` | [HTTP interceptor](#http-interceptor) |
| `core/services` | root-provided services | [frontend-core.md](frontend-core.md#services) |
| `core/models` | TypeScript interfaces mirroring backend payloads | [frontend-core.md](frontend-core.md#models) |
| `core/utils` | pure helper functions | [frontend-core.md](frontend-core.md#utils) |
| `core/avatar` | layered-avatar catalogue and assets | [frontend-core.md](frontend-core.md#avatar-assets) |
| `shared/layout` (`main-layout`, `app-header`, `page-header`) | page chrome | [frontend-ui.md](frontend-ui.md#layout) |
| `shared/components` (9 folders) | cross-feature components | [frontend-ui.md](frontend-ui.md#shared-components) |
| `shared/directives` | `ResizeHandleDirective`, `SwipeTabsDirective` | [frontend-ui.md](frontend-ui.md#directives) |
| `features/auth` (`login`, `register`) | sign-in and sign-up pages | routes above |
| `features/shell` | `home` shell | [The `home` shell](#the-home-shell) |
| `features/dashboard` | `DashboardComponent` | routes above |
| `features/settings` | `SettingsDialogComponent` (opened from the header) | [The `home` shell](#the-home-shell) |
| `features/campaigns` | `CampaignsComponent`, the campaign list | routes above |
| `features/characters` (`character-wizard`, `character-wizard-page`, `character-sheet-page`, `character-play-sheet`, `character-level-up-page`, `character-notes`, plus `characters.ts`) | character list, creation wizard (steps under `character-wizard/steps/`: `race-step`, `class-step`, `background-step`, `abilities-step`, `equipment-step` (with `equipment-choice`), `spells-step`, `details-step`), sheet, level-up, notes | routes above |
| `features/battle-map` (`canvas`, `components/`: `light-editor-panel`, `add-token-panel`, `turn-order-panel`, `map-toolbar`) | Konva battle-map screen | routes above |
| `features/dm/dm-campaigns` (`dm-campaign-hub`, `dm-campaign-maps`, `dm-campaign-session` with `encounter-form-dialog`, `dm-encounter-play` with `components/`: `character-token-detail`, `monster-token-detail`, `roster-panel`, `custom-token-editor`, `encounter-toolbar`) | DM-side campaign management | routes above |
| `features/player` (`player-campaigns/player-campaign-hub`, `player-campaigns/player-campaign-session`, `player-view`, `current-player-route`) | player-side campaign screens and the pop-out table view | routes above |
| `features/wiki` | `WikiComponent` plus workspace, live editor/preview, tree and slug helpers | routes above |
| `features/create-content` (`items` with `icon-picker-dialog`, `item-card-print`, `item-form`; `spells/spell-form`; `monsters/monster-form` with `entry-list`; `player-options`; `content-source-filter`; `content-detail-dialog`) | homebrew content library at `content-library` | routes above |

Per-feature documentation is not yet written; see "Not yet documented" in [../README.md](../README.md).

Sources: `dnd_vtt_frontend/src/app/` (directory listing).
