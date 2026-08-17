# Mobile, PWA, and Capacitor implementation audit

Date: 2026-08-16

## Repository and toolchain

- Repository root: `dnd-vtt/` with separate `dnd_vtt_frontend/` and `dnd_vtt_backend/` npm packages plus a small root orchestration package.
- Frontend: Angular 22 standalone components, Angular Router, signals, RxJS 7.8, Angular Material/CDK 22, SCSS, and Tailwind utilities.
- Backend: NestJS 11 REST API and Socket.IO gateways, SQLite through `@libsql/client`, and hand-written migrations in `DatabaseService`.
- Package manager: npm, with package lockfiles in the frontend and backend. The frontend declares npm 10.9.8; CI installs with the npm version bundled with Node 22. The inspected workstation uses Node 24.18.0 and npm 11.16.0.
- Production build: `npm run build` from the repository root builds Angular and then NestJS. Angular emits browser assets to `dnd_vtt_frontend/dist/dnd-app/browser`; NestJS serves that directory and the API from one origin.
- Current Angular production bundle: 351.63 kB initial raw size (87.40 kB estimated transfer) before mobile/PWA work.
- Deployment: GitHub Actions builds on pushes to `main` and restarts the self-hosted deployment with PM2. A Cloudflare Tunnel exposes the single NestJS origin.

## Application architecture

- Routing is declared in `dnd_vtt_frontend/src/app/app.routes.ts`; all feature pages are lazy-loaded standalone components.
- The authenticated `/home` tree uses one shared `ShellComponent`. Existing routes cover character lists, the character wizard and sheet, campaign hubs, session views, DM campaign tools, and a map/player-view route.
- Authentication is email/password with bcrypt and a seven-day JWT. The frontend currently persists the bearer token in Local Storage and attaches it through an HTTP interceptor.
- Authorization is ownership/membership based. Campaign creators are owners; joined players have active `campaign_members` rows and campaign character copies. Session and encounter visibility flags control player listings.
- State/data fetching uses Angular services, signals, and direct `HttpClient` promises. There is no competing global state or query-cache library.
- Real-time state uses singleton `socket.io-client` and NestJS Socket.IO gateways for map rooms, encounter presence, turn changes, and encounter-start notifications.
- The map renderer is Konva 10. It already supports stage dragging, wheel/button zoom, two-touch pinch zoom, resize observation, reset, rotation, fullscreen, fog, lighting, measurement, tokens, and initiative.
- Styling is responsive in individual templates but there is no dedicated mobile shell, bottom navigation, safe-area system, install UI, or standardized mobile loading/error state.

## Domain and API inventory

- Characters are owned JSON documents with indexed name/race/class/level columns. Campaign joins create an owned campaign copy. The wizard and play sheet already share services and rule utilities.
- Campaigns include ownership, membership, source restrictions, sessions, party visibility, and per-member edit permission. There is no authoritative current-session pointer.
- Sessions have campaign ownership, description/background, and `visible_to_players`; they do not have lifecycle/scheduling state.
- Encounters belong to sessions and include map, roster, status, summary, visibility, current turn, and round. The database does not enforce one active encounter per campaign.
- Maps include the uploaded image, grid, tokens, fog, and lighting. Token rows do not currently have player visibility/name visibility fields.
- Existing REST endpoints cover all core CRUD, but there is no player bootstrap/current-context aggregate, player-specific encounter/map DTO, refresh/logout endpoint, or draft-character lifecycle.

## Security findings and required corrections

- `GET /maps/:id`, `/maps/:id/tokens`, `/maps/:id/fog`, and `/maps/:id/lighting` are authenticated at the controller but do not validate ownership or membership in the service.
- Raw uploaded maps are served by the public `/uploads` static mount. A player who learns the URL can fetch the unmasked source image and bypass client-rendered fog.
- Map Socket.IO room joins and encounter-presence rooms are unauthenticated and accept arbitrary IDs. Presence attributes are self-reported by clients.
- Token/fog/lighting broadcasts use the same payload for every viewer. Encounter-start events are broadcast globally and filtered only by the receiving client.
- Session `findOneForUser` verifies membership but does not enforce `visible_to_players`, unlike session listings.
- Browser tokens are long-lived and stored in Local Storage. Logout removes only local state; there is no rotation, revocation, or server-side session record.
- CORS is configurable for HTTP but gateways use a separate single `FRONTEND_URL` value. Native origins are not configured.

## PWA and native readiness

- No manifest, Angular service worker, install/update UI, offline state, Capacitor configuration, or native projects are present.
- The production `index.html` loads Google fonts remotely. Angular also attempts to retrieve them while optimizing production builds, creating a network dependency.
- The existing Angular output contains `index.html` at the required browser output root and is suitable for Capacitor with `webDir: dist/dnd-app/browser`.
- CI Node 22 and the workstation Node 24 satisfy Capacitor 8's Node 22 minimum. Android requires API 24+ and Android Studio 2025.2.1+. iOS generation/build verification requires macOS and Xcode 26+.
- Selected native identity: app name `D&D VTT`, app ID `ca.mathomelab.dndvtt`.

## Testing baseline

- Frontend: Angular unit-test builder with Vitest; 14 files and 93 tests pass. Angular lint passes.
- Backend: Jest; 21 suites and 156 tests pass. Non-fixing ESLint and Nest build pass.
- No Playwright/Cypress browser suite exists. Backend has a Jest e2e configuration but no mobile browser matrix.
- CI currently runs backend unit tests, backend lint, and frontend lint. It does not run builds, frontend unit tests, browser E2E, PWA checks, or native builds.

## Implementation checklist

1. Add additive migrations, secure auth sessions, current context, drafts, and player-safe serializers.
2. Harden REST map access and Socket.IO authentication/rooms before exposing new mobile map routes.
3. Add responsive shell primitives, stable mobile aliases, dashboard/context selection, and touch-friendly character/campaign/encounter/map presentation.
4. Add Angular PWA shell caching only, install/update/offline UX, local fonts, and icons.
5. Gate Capacitor work on web/PWA acceptance; then add matching Capacitor 8 packages, Android/iOS projects, native lifecycle handling, secure native refresh storage, and explicit origins.
6. Add authorization/unit/E2E/PWA/native-critical coverage, CI gates, developer documentation, and real-device release checks.
