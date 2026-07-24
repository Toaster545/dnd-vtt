# D&D VTT

A web-based Virtual Tabletop (VTT) for D&D 5e campaigns. Players can create and manage their characters, and the Dungeon Master can run combat encounters on battle maps exported from [Dungeondraft](https://dungeondraft.net/).

## Features

- **Authentication** — Email/password login and registration via Supabase Auth
- **Role-based access** — `admin` (DM) and `player` roles with Row Level Security
- **Character creation** — Full 5e character sheet with race/class/background data from the [Open5e API](https://open5e.com/)
- **Character persistence** — Each player's characters are saved to their account
- **Battle maps** — Upload Dungeondraft PNG exports and display them on a grid canvas
- **Token system** — DM places and moves tokens; positions sync live to all viewers via Supabase Realtime
- **View-only for players** — Players see the map and tokens but cannot modify them

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 18 (standalone components, signals) |
| Auth & Database | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime + Storage) |
| Canvas / VTT | [Konva.js](https://konvajs.org/) |
| 5e Game Data | [Open5e API](https://api.open5e.com/v1/) |
| Styling | SCSS (custom dark theme) |

## Getting Started

### Prerequisites

- Node.js 18+ (project uses [fnm](https://github.com/Schniz/fnm))
- A free [Supabase](https://supabase.com) account

### 1. Set up Supabase

1. Create a new Supabase project at [app.supabase.com](https://app.supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql` — this creates all tables, RLS policies, and the storage bucket
3. Go to **Settings → API** and copy your **Project URL** and **anon public key**

### 2. Configure environment

Edit `dnd-app/src/environments/environment.ts`:

```ts
export const environment = {
  production: false,
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseKey: 'your-anon-key',
};
```

> **Note:** Do not commit real credentials. Add `src/environments/environment.ts` to `.gitignore` once you fill in real values, or use a secrets manager.

### 3. Install and run

```bash
cd dnd-app
npm install
npx ng serve
```

Open [http://localhost:4200](http://localhost:4200).

### 4. Make yourself admin (DM)

After registering an account, run this in the Supabase SQL Editor:

```sql
update profiles set role = 'admin' where email = 'your@email.com';
```

Only admin accounts can upload maps, place tokens, and access the Map Manager.

## Project Structure

```
dnd-app/src/app/
├── core/
│   ├── guards/          # authGuard, adminGuard
│   ├── models/          # TypeScript interfaces (Character, BattleMap, etc.)
│   └── services/        # auth, character, battle-map, open5e, supabase
└── features/
    ├── auth/            # login, register
    ├── characters/      # character-list, character-sheet
    ├── battle-map/      # Konva.js VTT canvas
    ├── admin/           # map-manager (DM only)
    └── dashboard/       # home screen
```

## Using Dungeondraft Maps

1. In Dungeondraft, export your map as **PNG** (File → Export)
2. Note the **grid cell size in pixels** of your export (usually 70px or 140px at standard resolution)
3. In the app, go to **Map Manager** and upload the PNG with that grid size
4. Open the map in the VTT — the grid overlay will align to the image

## Database Schema

| Table | Purpose |
|---|---|
| `profiles` | User accounts with roles |
| `characters` | Player character sheets (RLS: players own their own) |
| `battle_maps` | Uploaded maps (admin write, all read) |
| `map_tokens` | Token positions per map (admin write, all read, Realtime enabled) |
| `campaigns` | Campaign metadata (admin only) |

## License

MIT
