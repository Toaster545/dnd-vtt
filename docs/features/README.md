# Features index: one doc per user-facing feature, with the frontend folders and backend modules each one covers.

Last updated: 2026-10-28 (commit 00cb49a)

Each feature doc describes what the user does, how it flows from components and services to endpoints ([../api/](../api/README.md)), socket events ([../architecture/realtime.md](../architecture/realtime.md)) and tables ([../data-model.md](../data-model.md)), the key files, and known limitations.

| Doc | Feature | Frontend folders (`src/app/features/`) | Backend modules (`dnd_vtt_backend/src/`) |
|---|---|---|---|
| [accounts-and-settings.md](accounts-and-settings.md) | Register, sign in, Settings dialog (appearance, PWA install, admin user management) | `auth/`, `settings/` | `auth/`, `users/`, `backgrounds/` |
| [shell-and-dashboard.md](shell-and-dashboard.md) | Post-login frame, tabs, live alerts, landing dashboard | `shell/`, `dashboard/` | `campaigns/`, `characters/`, `encounters/` (data and events) |
| [campaigns.md](campaigns.md) | Campaign list, join codes, DM hub, DM maps page, player hub, "current game" routes | `campaigns/`, `dm/dm-campaigns/dm-campaign-hub`, `dm/dm-campaigns/dm-campaign-maps`, `player/player-campaigns/player-campaign-hub`, `player/current-player-route` | `campaigns/`, `player/` |
| [sessions-and-encounters.md](sessions-and-encounters.md) | Session pages, encounter form, DM encounter play, player session and join, table screen | `dm/dm-campaigns/dm-campaign-session`, `dm/dm-campaigns/dm-encounter-play`, `player/player-campaigns/player-campaign-session`, `player/player-view` | `sessions/`, `encounters/` |
| [battle-map.md](battle-map.md) | Konva canvas: tokens, fog, lighting, walls, measuring, move range, turn tracking | `battle-map/` | `maps/` |
| [characters.md](characters.md) | Character list, play sheet, rests, inventory, spells, portraits, notes tab | `characters/` (list, sheet page, play sheet, notes) | `characters/` |
| [character-wizard.md](character-wizard.md) | Step-by-step creation and editing, autosaved drafts, live preview, level-up mode | `characters/character-wizard`, `character-wizard-page`, `character-level-up-page` | `characters/`, `content/` |
| [companions.md](companions.md) | Primal Companion and Steel Defender | none of its own (play sheet tab, DM encounter page, `shared/components/companion-sheet`) | `companions/` |
| [wiki.md](wiki.md) | Campaign wiki with live-preview editor | `wiki/` | `wiki/` |
| [content-library.md](content-library.md) | Browse official content, author homebrew monsters, items and spells | `create-content/` | `content/` |

Every folder under `dnd_vtt_frontend/src/app/features/` is covered above (`auth`, `battle-map`, `campaigns`, `characters`, `create-content`, `dashboard`, `dm`, `player`, `settings`, `shell`, `wiki`). The backend `common/`, `types/` and `config.ts` have no user-facing feature; they are in [../architecture/backend.md](../architecture/backend.md).

Sources: `dnd_vtt_frontend/src/app/features/` (directory listing), `dnd_vtt_backend/src/` (module directories), `dnd_vtt_frontend/src/app/app.routes.ts`.
