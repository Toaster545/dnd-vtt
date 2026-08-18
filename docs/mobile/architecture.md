# Mobile architecture

The mobile implementation remains one Angular application and one NestJS backend. The breakpoint at 1024 CSS pixels changes navigation and presentation, not domain services or authorization.

```text
                         Shared NestJS backend
              REST / JWT + refresh / Socket.IO / SQLite
                                  |
             +--------------------+--------------------+
             |                                         |
      Desktop web shell                         Mobile player shell
      Full DM + player VTT                      Player-focused routes
             |                                         |
             +--------------------+--------------------+
                                  |
                 Shared Angular services and Konva map
                                  |
                    Web / installed PWA / Capacitor
```

## Context and navigation

`GET /api/player/bootstrap` validates locally remembered character and campaign IDs and returns an explicit current session, active encounter, and map. Stable aliases under `/home/campaign/` resolve that authoritative state to existing ID-based pages. They never infer a current game from dates.

The DM selects `campaigns.current_session_id`; starting an encounter selects its parent session. A conflict check prevents two active encounters in one campaign.

## Trust boundaries

- Access JWT: 15 minutes, memory only.
- Web refresh: rotating 30-day opaque credential in a Secure, HttpOnly, SameSite=Strict cookie.
- Native refresh: returned only to native login/refresh and stored through Capacitor Keychain/Keystore secure storage.
- Socket.IO: JWT-authenticated handshake; campaign/map/encounter rooms are authorized from SQLite records.
- Maps: raw files are not public. DM images and fog-masked player rasters require authenticated endpoints. Player serialization removes hidden tokens, monster fields, HP/stat data, and unrevealed names.
- PWA cache: versioned application shell and static assets only. There is no API, upload, or authenticated-image data group.

## Reconnect model

Socket authentication is refreshed whenever the access credential rotates. Map subscriptions rejoin and refetch canonical state after reconnect. Native app resume refreshes authentication and player context. The UI exposes offline and reconnecting states globally.
