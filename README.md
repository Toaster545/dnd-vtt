# D&D VTT

A self-hosted web-based Virtual Tabletop (VTT) for D&D 5e campaigns. Players can create and manage their characters, and the Dungeon Master can run combat encounters on battle maps exported from [Dungeondraft](https://dungeondraft.net/).

No cloud account required — everything runs locally and is exposed via a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## Features

- **Authentication** — Email/password login and registration with bcrypt + JWT
- **Role-based access** — `admin` (DM) and `player` roles enforced on the backend
- **Character creation** — Full 5e character sheet with race/class/background data from the [Open5e API](https://open5e.com/)
- **Character persistence** — Each player's characters are saved to their account
- **Battle maps** — Upload Dungeondraft PNG exports and display them on a grid canvas
- **Live token sync** — DM places and moves tokens; positions update in real time for all viewers via WebSockets
- **View-only for players** — Players see the map and tokens but cannot modify them

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 18 (standalone components, signals) |
| Backend | NestJS (REST API + WebSocket gateway) |
| Database | SQLite via [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) |
| Auth | bcrypt + JWT (`@nestjs/jwt`) |
| Canvas / VTT | [Konva.js](https://konvajs.org/) |
| Real-time | socket.io (WebSockets) |
| 5e Game Data | [Open5e API](https://api.open5e.com/v1/) |
| Styling | SCSS (custom dark theme) |

## Project Structure

```
dnd-vtt/
├── dnd_vtt_backend/        # NestJS API server (also serves the Angular build)
│   ├── src/
│   │   ├── auth/           # JWT guard, admin guard, login/register endpoints
│   │   ├── characters/     # Character CRUD endpoints
│   │   ├── maps/           # Map + token endpoints, WebSocket gateway
│   │   └── common/         # DatabaseService, CurrentUser decorator
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
        │   └── services/   # auth, character, battle-map, socket, open5e
        └── features/
            ├── auth/       # login, register
            ├── characters/ # character-list, character-sheet
            ├── battle-map/ # Konva.js VTT canvas
            ├── admin/      # map-manager (DM only)
            └── dashboard/  # home screen
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

### 1. Build the frontend

```bash
cd dnd_vtt_frontend
npm install
npx ng build
```

This compiles the Angular app into `dnd_vtt_frontend/dist/dnd-app/browser/`, which NestJS will serve.

### 2. Set up and start the backend

```bash
cd dnd_vtt_backend
cp .env.example .env
npm install
```

Edit `.env`:

```env
PORT=3000
JWT_SECRET=some-long-random-string
CORS_ORIGINS=http://localhost:4200,https://yourdomain.com
DB_PATH=./data/dnd.db
```

Start the server:

```bash
npm run start:dev
```

The SQLite database and schema are created automatically on first run at `data/dnd.db`.

The app is now available at `http://localhost:3000`.

### 3. Create the admin (DM) account

Register your DM account through the app, then promote it from the backend directory:

```bash
node scripts/make-admin.mjs your@email.com
```

Only admin accounts can upload maps, place/move tokens, and access the Map Manager.

### Deploying changes

After editing frontend code, rebuild and restart:

```bash
# In dnd_vtt_frontend/
npx ng build

# In dnd_vtt_backend/
npm run start:dev   # watch mode restarts automatically on backend changes
```

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
| GET | `/maps` | Auth | List all maps |
| GET | `/maps/:id` | Auth | Get map |
| POST | `/maps` | Admin | Create map |
| POST | `/maps/upload` | Admin | Upload map image |
| GET | `/maps/:id/tokens` | Auth | Get tokens for map |
| POST | `/maps/:id/tokens` | Admin | Add/update token |
| DELETE | `/maps/:id/tokens/:tokenId` | Admin | Delete token |

Token positions are also pushed in real time to all connected clients via the WebSocket gateway on the same port.

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
| `characters` | Player character sheets (scoped to owning user) |
| `battle_maps` | Uploaded maps |
| `map_tokens` | Token positions per map (broadcast via WebSocket on change) |

## License

MIT
