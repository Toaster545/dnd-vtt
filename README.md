[README](./README.md) · [TODO](./TODO.md)

# D&D VTT

A self-hosted web-based Virtual Tabletop (VTT) for D&D 5e campaigns. Players can create and manage their characters, and the Dungeon Master can run combat encounters on battle maps exported from [Dungeondraft](https://dungeondraft.net/).

No cloud account required — everything runs locally and is exposed via a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## Features

- **Authentication** — Email/password login and registration with bcrypt + JWT
- **Role-based access** — `admin` (DM) and `player` roles enforced on the backend
- **Character creation wizard** — Full 2024 5e character sheet built step by step (race,
  class/subclass, background, ability scores, equipment, spells, details), backed by static
  SRD-derived game data served from the backend — no external API dependency
- **Feats** — Origin, General, and Fighting Style feats with data-driven prerequisites; the
  wizard only offers feats a character actually qualifies for, and any ability score increase or
  mechanical bonus a feat grants (AC, damage, extra HP, etc.) is automatically factored into the
  character's computed stats
- **Character persistence** — Each player's characters are saved to their account
- **Session management** — DM creates and tracks game sessions
- **Encounters** — DM builds a roster of monsters and characters against a map, then starts the
  encounter to generate a join code; players join with that code and one of their own characters
  from their own device, live presence (who's connected, self-reported HP) is broadcast to the DM
- **Battle maps** — Upload Dungeondraft PNG exports and display them on a grid canvas
- **Live token sync** — DM places and moves tokens; positions update in real time for all viewers via WebSockets
- **Per-token color** — Each character and monster type gets a distinct default token color,
  overridable per-roster-entry via a color picker
- **Initiative tracker** — Placing a monster token auto-rolls 1d20 + its DEX modifier into a
  turn-order list; player tokens wait for the DM to enter their rolled initiative. The DM can edit
  any value or reroll a monster; players see the same turn order read-only
- **View-only for players** — Players see the map and tokens but cannot modify them

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 22 (standalone components, signals) |
| Backend | NestJS (REST API + WebSocket gateway) |
| Database | SQLite via [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) |
| Auth | bcrypt + JWT (`@nestjs/jwt`) |
| Canvas / VTT | [Konva.js](https://konvajs.org/) |
| Real-time | socket.io (WebSockets) |
| 5e Game Data | Static SRD-derived JSON served by the backend's Content module (see below) |
| Styling | SCSS + Tailwind utilities (custom dark theme); Angular Material used selectively |

## Project Structure

```
dnd-vtt/
├── dnd_vtt_backend/        # NestJS API server (also serves the Angular build)
│   ├── src/
│   │   ├── auth/           # JWT guard, admin guard, login/register endpoints
│   │   ├── characters/     # Character CRUD endpoints
│   │   ├── content/        # Serves static 5e game content (see content/ below)
│   │   ├── encounters/     # Encounter CRUD, join codes, live presence WebSocket gateway
│   │   ├── maps/           # Map + token endpoints (incl. initiative), WebSocket gateway
│   │   ├── sessions/       # Game session CRUD endpoints (DM only)
│   │   └── common/         # DatabaseService, CurrentUser decorator
│   ├── content/            # Static SRD-derived game data (JSON, one file per entry)
│   │   ├── classes/        # Class + subclass features, levels, grants
│   │   ├── races/          # Species traits
│   │   ├── backgrounds/    # Backgrounds + origin ability increase
│   │   ├── feats/          # Origin, General, and Fighting Style feats
│   │   ├── items/          # Weapons, armor, gear
│   │   └── spells/         # Spell list
│   ├── data/               # SQLite database file (auto-created)
│   ├── scripts/            # Utility scripts (e.g. make-admin)
│   ├── uploads/            # Uploaded map images (served as static files)
│   └── .env.example
└── dnd_vtt_frontend/       # Angular app
    └── src/app/
        ├── core/
        │   ├── guards/     # authGuard, adminGuard
        │   ├── interceptors/ # auth interceptor (injects Bearer token)
        │   ├── models/     # TypeScript interfaces
        │   └── services/   # auth, character, character-stats, battle-map, content, session, socket
        └── features/
            ├── auth/       # login, register
            ├── characters/ # character-list, character-sheet
            ├── battle-map/ # Konva.js VTT canvas, shared by DM and player views (incl. turn order)
            ├── admin/      # map-manager (DM only)
            ├── dashboard/  # home screen
            ├── player/     # player-facing area: join an encounter by code, play own character
            └── dm/         # DM-only area (gated by adminGuard)
                ├── dm-create/       # session/encounter management + character wizard
                │   ├── dm-encounters/                          # build an encounter's roster
                │   └── dm-characters/character-wizard/steps/   # one component per wizard step
                └── dm-play/         # live session/encounter view, character play sheet
```

## Architecture

NestJS runs on port 3000 and serves everything:

- `GET /api/**` — REST API
- `GET /uploads/**` — uploaded map images
- `/socket.io` — WebSocket connections
- Everything else — Angular SPA (`index.html` + static assets)

A single Cloudflare Tunnel forwards `yourdomain.com → localhost:3000`.

## Getting Started

### Prerequisites

- Node.js 18+

### 1. Install dependencies

```bash
cd dnd_vtt_frontend && npm install && cd ../dnd_vtt_backend && npm install && cd ..
```

### 2. Configure the backend

```bash
cd dnd_vtt_backend
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
JWT_SECRET=some-long-random-string
CORS_ORIGINS=http://localhost:4200,https://yourdomain.com
DB_PATH=./data/dnd.db
```

The SQLite database and schema are created automatically on first run at `data/dnd.db`.

### 3. Run it

From the repo root, `npm run dev` runs the backend (`start:dev`, with `DEV_BYPASS=true`) and the
frontend (rebuild-on-change `watch`) concurrently:

```bash
npm run dev
```

During active frontend development it's usually faster to run `ng serve` (port 4200, proxies
`/api` to the backend) instead of rebuilding on every change — see `dnd_vtt_frontend/README.md`.

For a one-off production-style build and run instead of `npm run dev`:

```bash
npm run build   # builds the frontend, then the backend
npm start       # runs the built backend, which also serves the built frontend
```

The app is now available at `http://localhost:3000`.

### 4. Create the admin (DM) account

Register your DM account through the app, then promote it from the backend directory:

```bash
node scripts/make-admin.mjs your@email.com
```

Only admin accounts can upload maps, place/move tokens, access the Map Manager and Session
Manager, and create/edit characters through the DM's character wizard.

## API Endpoints

All endpoints are prefixed with `/api`. Protected routes require a `Bearer` token in the `Authorization` header.

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Create account |
| POST | `/auth/login` | Public | Returns JWT |
| GET | `/auth/me` | Auth | Current user profile |
| GET | `/characters` | Auth | List your characters |
| POST | `/characters` | Auth | Create character |
| GET | `/characters/:id` | Auth (own) | Get character |
| PUT | `/characters/:id` | Auth (own) | Update character |
| DELETE | `/characters/:id` | Auth (own) | Delete character |
| GET | `/content/classes`, `/content/classes/:index` | Auth | Class/subclass data |
| GET | `/content/races`, `/content/races/:index` | Auth | Species data |
| GET | `/content/backgrounds`, `/content/backgrounds/:index` | Auth | Background data |
| GET | `/content/feats`, `/content/feats/:index` | Auth | Feat data |
| GET | `/content/items`, `/content/items/:index` | Auth | Weapon/armor/gear data |
| GET | `/content/spells`, `/content/spells/:index` | Auth | Spell data |
| GET | `/sessions` | Admin | List game sessions |
| POST | `/sessions` | Admin | Create session |
| DELETE | `/sessions/:id` | Admin | Delete session |
| GET | `/encounters` | Admin | List the DM's encounters |
| GET | `/encounters/join/:code` | Auth | Resolve an active encounter by its join code |
| GET | `/encounters/:id` | Admin | Get encounter |
| POST | `/encounters` | Admin | Create encounter (name, map, monster/character roster) |
| PUT | `/encounters/:id` | Admin | Update encounter (e.g. add a monster/character to the roster) |
| DELETE | `/encounters/:id` | Admin | Delete encounter |
| POST | `/encounters/:id/start` | Admin | Activate encounter, generating a join code |
| POST | `/encounters/:id/stop` | Admin | Deactivate encounter |
| GET | `/maps` | Auth | List all maps |
| GET | `/maps/:id` | Auth | Get map |
| POST | `/maps` | Admin | Create map |
| POST | `/maps/upload` | Admin | Upload map image |
| GET | `/maps/:id/tokens` | Auth | Get tokens for map |
| POST | `/maps/:id/tokens` | Admin | Add/update token (new monster tokens auto-roll initiative) |
| DELETE | `/maps/:id/tokens/:tokenId` | Admin | Delete token |
| POST | `/maps/:id/tokens/:tokenId/reroll-initiative` | Admin | Reroll a monster token's initiative |

Token positions are also pushed in real time to all connected clients via the WebSocket gateway on
the same port, as is who's currently present in a live encounter (`encounter-presence.gateway.ts`).

## 5e Game Content

Static SRD-derived game data (classes, races, backgrounds, feats, items, spells) lives as JSON
files under `dnd_vtt_backend/content/`, one file per entry, served by the `ContentModule` and
cached in memory per-process. There's no external API dependency and no database table for this
data — it's read-only reference content shared by every character.

Class/race/background levels describe their choices (skills, ability score increases, weapon
mastery, feats, etc.) as a small set of structured "grant" types the character wizard renders
generically, rather than one-off UI per class. Feats carry a `category` (`origin`, `general`, or
`fighting_style`) plus an optional `prerequisite` (ability score minimums, armor/spellcasting
requirements, a required class feature, or specific classes) and an optional mechanical effect
(`abilityIncrease` and/or `effects`) that the wizard applies automatically once picked.

## Using Dungeondraft Maps

1. In Dungeondraft, export your map as **PNG** (File → Export)
2. Note the **grid cell size in pixels** of your export (typically 70px or 140px at standard resolution)
3. In the app, go to **Map Manager** and upload the PNG with that grid size
4. Open the map in the VTT — the grid overlay aligns to the image
5. Click on the map to place a token; drag to move it; right-click to remove it

## Database Schema

| Table | Purpose |
|---|---|
| `profiles` | User accounts, hashed passwords, roles |
| `characters` | Player character sheets (scoped to owning user); stored as a single JSON `data` column, not normalized fields |
| `sessions` | DM-created game sessions |
| `encounters` | DM-built roster (monsters + characters) against a map, with a `status` and a `join_code` once started |
| `battle_maps` | Uploaded maps |
| `map_tokens` | Token positions per map, including `initiative` (broadcast via WebSocket on change) |

There's no ORM — schema changes are hand-rolled migrations gated by `PRAGMA user_version` in `DatabaseService`.

## Mobile, PWA, and Capacitor

The same Angular application supplies the desktop DM workspace and the player-focused mobile shell. Below 1024px it exposes Home, Character, Campaign, Encounter, and Map navigation with safe-area spacing. Current-game routes use the DM-selected campaign session and active encounter rather than timestamps.

Node.js 22+ is required for Capacitor 8. Useful commands:

```bash
cd dnd_vtt_frontend
npm run build
npm test -- --watch=false
npm run e2e
npm run cap:sync
npm run cap:open:android
npm run cap:run:android
npm run android:debug
npm run cap:open:ios
npm run cap:run:ios
```

Set `JWT_SECRET`, `DB_PATH`, and an exact comma-separated `CORS_ORIGINS` list. Production should include the deployed HTTPS origin plus `https://localhost` and `capacitor://localhost`. Native API/WebSocket traffic targets `https://dnd.mathomelab.ca`; change the production environment deliberately for another private deployment.

Android requires JDK 21, Android Studio 2025.2.1+, and API 24+. iOS requires macOS, Xcode 26, and iOS 15+. Native projects contain bundled web assets; no remote `server.url` is used. Signing/provisioning material and public store publication are excluded.

See [mobile architecture](docs/mobile/architecture.md), [PWA installation](docs/mobile/pwa-installation.md), [Capacitor development](docs/mobile/capacitor-development.md), and [test evidence](docs/mobile/testing.md). Known limitations include no offline mutations or push notifications and required emulator/physical-device release testing.

## License

MIT
