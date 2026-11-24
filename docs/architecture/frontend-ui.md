# Frontend UI: shared layout, components and directives, styling (SCSS, Tailwind, Material), PWA service worker and Capacitor pointers.

Last updated: 2026-10-28 (commit 00cb49a)

Paths are relative to `dnd_vtt_frontend/` unless stated otherwise. Routing and bootstrapping: [frontend.md](frontend.md). Services and utils: [frontend-core.md](frontend-core.md).

## Layout

`src/app/shared/layout/`: three presentational standalone components that frame the `home` shell ([frontend.md](frontend.md#the-home-shell)).

| Component (selector) | Purpose |
|---|---|
| `MainLayoutComponent` (`app-main-layout`) | Page frame: a header slot (content projected with the `layoutHeader` attribute) above the page body. Input `embedded` (default `false`) swaps `h-screen` for `h-full` when mounted inside another layout. |
| `AppHeaderComponent` (`app-header`) | Top bar with the navigation tabs, a Settings button (output `selectSettings`) and a Sign-out button (`AuthService.signOut()`). Which tab is highlighted comes from an `activeTab` input; clicks are emitted as outputs so the host (`ShellComponent`, `DashboardComponent`) decides what they do. |
| `PageHeaderComponent` (`app-page-header`) | Page title bar with a back link; input `backRoute` (default `/home`). |

Sources: `src/app/shared/layout/*/*.ts`, `src/app/shared/layout/app-header/app-header.html`.

## Shared components

`src/app/shared/components/<name>/`, one folder each. All are standalone.

| Folder | Selector / class | Purpose |
|---|---|---|
| `avatar-creator-dialog` | `AvatarCreatorDialogComponent` (+ `PortraitCropperComponent`, `TokenBorderPreviewComponent`) | Dialog for building an avatar recipe or uploading/cropping a portrait and choosing a token border. Data: `AvatarCreatorDialogData` (`seed`, `recipe`, `image`, `tokenBorder`, `portraitUseToken`); result type `AvatarCreatorResult`. The preview draws with `drawBorderedToken` so it matches the battle map. |
| `character-portrait` | `app-character-portrait` | Renders a character's portrait or token image at a given `size`, optionally with its token border (`border`, `useToken` inputs). |
| `companion-sheet` | `app-companion-sheet` | Companion stat sheet for a character (`characterId` input, `readonly`, `changed` output); backed by `CompanionService`. |
| `confirm-dialog` | `ConfirmDialogComponent`, `ConfirmService` | `ConfirmService.confirm(message, title = 'Are you sure?', confirmLabel = 'Delete')` opens a 400px `MatDialog` and resolves to a boolean. |
| `content-source-dialog` | `ContentSourceDialogComponent` | Dialog for choosing content sources; data `sources`, `enabledCodes`, `allowedCodes`. |
| `description-dialog` | `DescriptionDialogComponent` | Dialog with a text area to edit a description (`title`, `description`, optional `placeholder`). |
| `magic-inventory` | `app-magic-inventory` | Magic-item panel for a character: inputs `character`, `items`, `isDm`, `canBond`, `restOnly`; outputs `bond`, `saved`, `closed`. |
| `party-list` | `app-party-list` | Presentational list of campaign members; renders what it is given and emits one output per action (`rowClick`, `toggleEditAccess`, `togglePartyVisibility`, `removeMember`, `viewCharacter`, `editCharacter`, `levelUpCharacter`, …) so each host keeps its own logic. |
| `statblock-export-menu` | `app-statblock-export-menu` | Icon button and menu to copy or download an Obsidian Fantasy Statblocks export (built lazily on click via `statblock-export.ts`). |

Sources: `src/app/shared/components/*/*.ts`.

## Directives

`src/app/shared/directives/`:

| Directive | Selector | Purpose |
|---|---|---|
| `ResizeHandleDirective` | `[appResizeHandle]` | Draggable divider between panels; emits the horizontal pointer movement per drag frame via the `resizeDrag` output (the consumer applies sign and clamping). Host class `cursor-col-resize select-none`. |
| `SwipeTabsDirective` | `[appSwipeTabs]` | Detects horizontal touch swipes (min 50 px, max 60 px vertical drift) so tabbed views can advance on touch devices; touch events only. |

There is no `pipes/` folder.

Sources: `src/app/shared/directives/*.directive.ts`.

## Styling

- Global stylesheet: `src/styles.scss` (the only entry in `angular.json` `styles`). It `@use`s `@angular/material` and `src/_tokens.scss`, imports the `@fontsource` packages for Cinzel (400/600/700) and Nunito (400/500/600/700) and `material-icons`, then the three `@tailwind` layers.
- Design tokens: `src/_tokens.scss` defines the five color schemes in `$themes` (`gold`, `crimson`, `emerald`, `royal-blue`, `silver`). An `@each` loop in `styles.scss` emits the CSS custom properties per `data-theme`; `ColorSchemeService` sets that attribute on `<html>` ([frontend-core.md](frontend-core.md#app-shell-and-preference-services)).
- Tailwind (`tailwind.config.js`, `postcss.config.js`): content `./src/**/*.{html,ts}`; colors (`gold`, `canvas`, `surface`, `parchment`, `slate`, `coal`, and Tailwind's `white`) are mapped to the theme variables with the `rgb(var(--…-rgb) / <alpha-value>)` pattern so opacity modifiers work; `crimson`, `danger` and `success` are fixed hex values; font families `brand` (Cinzel) and `body` (Nunito); custom border radii and shadows.
- Component classes in `styles.scss` (`@layer components`): `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-danger`, `.btn-icon`, `.card`, `.card-translucent`, `.card-body`, `.card-header`, `.app-toolbar`, `.tab-pill`, `.field`, `.field-label`, `.field-input`, `.field-error`, `.nav-item`, `.spinner*`, `.tag`.
- Backgrounds: `.bg-image-none|parchment|stone|starfield|mist` classes and the `.app-bg-overlay` element; selected and layered by `BackgroundService`.
- Print: an `@media print` block (`.print-root`, `.no-print`) used by printable views such as the item card print.
- Mobile: an `@media (max-width: 1023px)` block in `styles.scss`.
- UI scale: `UiScaleService` changes the root font size, so rem-based Tailwind utilities scale together.
- Component styles: most components use external `.scss` files (`inlineStyleLanguage: scss`); the production build warns above 4 kB and errors above 8 kB per component style (`angular.json` budgets). `src/app/app.scss` is empty.
- Angular Material is used selectively. Imports found under `src/app`: `@angular/material/icon` (most used), `tooltip`, `dialog`, `menu`. `styles.scss` applies a minimal `mat.theme(...)` (violet palette, fonts from the tokens) for dialog, snackbar and tooltip tokens and restyles `.mat-mdc-dialog-container`. `@angular/cdk` is also a dependency.

Sources: `src/styles.scss`, `src/_tokens.scss`, `tailwind.config.js`, `postcss.config.js`, `angular.json`, `src/app/core/services/color-scheme.service.ts`, `src/app/core/services/background.service.ts`.

## PWA and service worker

- `src/app/app.config.ts` registers `ngsw-worker.js` only in production builds and not on native platforms; registration waits until the app is stable (30 s fallback).
- `angular.json` passes `serviceWorker: "ngsw-config.json"` to the build. `ngsw-config.json` defines two asset groups: `app-shell` (prefetch: `/favicon.ico`, `/index.html`, `/manifest.webmanifest`, `/*.css`, `/*.js`, `/icons/**`) and `lazy-assets` (lazy install, prefetch update: fonts and images by extension). `navigationUrls` is `/**` excluding paths with a file extension, `/api/**` and `/uploads/**`. There are no `dataGroups`, so API responses are not cached.
- `public/manifest.webmanifest`: name and short name `NatOne`, `start_url` `/home/dashboard`, `display: standalone`, theme color `#b9913f`; icons in `public/icons/` (`natone-192.png`, `natone-512.png`, `dnd-vtt.svg`). `src/index.html` links the manifest and sets the Apple web-app meta tags.
- Runtime behaviour is in `PwaService` ([frontend-core.md](frontend-core.md#app-shell-and-preference-services)): online/offline signals (rendered by `App` as a banner), install prompt capture, and a `window.confirm` reload prompt when a new version is ready.
- Install and validation steps: [../mobile/pwa-installation.md](../mobile/pwa-installation.md).

Sources: `src/app/app.config.ts`, `ngsw-config.json`, `public/manifest.webmanifest`, `src/index.html`, `src/app/core/services/pwa.service.ts`, `angular.json`.

## Capacitor (native wrapper)

- `capacitor.config.ts`: `appId` `ca.mathomelab.dndvtt`, `appName` `NatOne`, `webDir` `dist/dnd-app/browser`, `androidScheme` `https`, `iosScheme` `capacitor`, plugin settings for `StatusBar`, `SplashScreen` and `Keyboard`. The native projects are `android/` and `ios/`.
- Code that branches on `Capacitor.isNativePlatform()`: `environment.prod.ts` (absolute API/WS host), `app.config.ts` (no service worker), `AuthTokenService` (refresh token in secure storage), `PwaService` (network plugin), `NativeLifecycleService` (resume handling).
- Scripts (`cap:sync`, `cap:open:*`, `cap:run:*`, `android:debug`) are defined in `package.json`; development workflow and architecture are in [../mobile/capacitor-development.md](../mobile/capacitor-development.md) and [../mobile/architecture.md](../mobile/architecture.md); audit and test notes in [../mobile/implementation-audit.md](../mobile/implementation-audit.md) and [../mobile/testing.md](../mobile/testing.md).

Sources: `capacitor.config.ts`, `package.json`, `src/environments/environment.prod.ts`, `src/app/core/services/auth-token.service.ts`, `src/app/core/services/native-lifecycle.service.ts`.
