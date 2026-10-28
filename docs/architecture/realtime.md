# Realtime architecture: the socket.io gateways, their rooms, and which events they send and receive.

Last updated: 2026-10-28 (commit 00cb49a)

socket.io runs on the same port and HTTP server as the REST API (no separate WS server or port). Clients connect at the default `/socket.io` path (`main.ts` lets requests to it fall through the SPA handler). There are three gateway classes. Event payload detail for clients belongs in the API docs.

## Connection and authentication

- `TokensGateway` and `EncounterPresenceGateway` call `SocketAuthService.install(server)` in `afterInit`. The handshake must carry `auth.token` (a JWT, or `dev` under `DEV_BYPASS`); otherwise the connection is rejected with `unauthorized`. See [auth](auth.md#socket-authentication).
- Both gateways use `@WebSocketGateway({ cors: corsOptions() })`, the same origin list as REST (`CORS_ORIGINS`, see [backend](backend.md#configuration-helpers)).
- `CompanionsGateway` uses a bare `@WebSocketGateway()` and does not install auth or CORS itself; it only emits. Whether it shares the same underlying socket.io server as the other two is not verified here.
- Handler authorization failures are converted by `wsGuard` to `WsException({ status, message })`.
- Room state is in memory only; nothing about rooms or presence is persisted, and a restart drops it.

Sources: `dnd_vtt_backend/src/auth/socket-auth.service.ts`, `dnd_vtt_backend/src/common/ws-guard.ts`, `dnd_vtt_backend/src/config.ts` (`corsOptions`).

## Rooms

| Room | Joined by | Purpose |
|---|---|---|
| `campaign:<campaignId>` | Automatically in `EncounterPresenceGateway.handleConnection` for every campaign where the user is `dm_id` or has an `active` `campaign_members` row | Campaign-wide notifications |
| `map:<mapId>:dm` | `join_map`, if the user is the campaign's DM | Unredacted map data |
| `map:<mapId>:player` | `join_map`, if the user is an active member and the map is revealed to players | Redacted map data |
| `encounter-presence:<encounterId>` | `watch_encounter_presence` (DM) or `announce_presence` (player) | Encounter presence, turn state and token-change nudges |

The DM/player split lets the server send each audience different payloads for the same change. Room membership is only granted after `CampaignAccessService` checks (`socketMapRole`, `encounterFor`); see [auth](auth.md#roles-and-adminguard). Membership in `campaign:*` rooms is computed once at connect time.

Sources: `dnd_vtt_backend/src/encounters/encounter-presence.gateway.ts` (`handleConnection`), `dnd_vtt_backend/src/maps/tokens.gateway.ts`, `dnd_vtt_backend/src/campaigns/campaign-access.service.ts`.

## `TokensGateway` (`src/maps/tokens.gateway.ts`)

Client to server:

| Event | Payload | Behaviour |
|---|---|---|
| `join_map` | `mapId` (string) | Resolves role via `CampaignAccessService.socketMapRole`, joins `map:<id>:<role>`, acks `{ joined: true, role }` |
| `leave_map` | `mapId` | Leaves both map rooms |
| `measure` | `{ mapId, measurement }`, where `measurement` is `{ shape (`line`, `cone` or `sphere`), originCol, originRow, pointCol, pointRow }` or `null` | Ignored unless the sender is in `map:<id>:dm`; relays to the other sockets in both map rooms. Not persisted. `null` clears the ruler |

Server to client (sent by `MapsService` and `EncountersService` calling the gateway's methods):

| Event | Rooms | Payload | Sent by method |
|---|---|---|---|
| `tokens_updated` | `map:<id>:dm` gets all tokens (after `CompanionsService.decorateTokens` when available); `map:<id>:player` gets `serializePlayerTokens(tokens)` | token list | `broadcastTokens` |
| `encounter_tokens_changed` | `encounter-presence:<encounterId>` for each encounter level using the map | `{ encounterId }` | `broadcastTokens` (via `notifyEncounterTokensChanged`) |
| `fog_updated` | both map rooms | fog state | `broadcastFog` |
| `fog_cells` | both map rooms | `{ cells, revealed }` | `broadcastFogCells` |
| `lighting_updated` | DM room: full lighting; player room: lights tied to tokens not visible to players are dropped and every light `label` is blanked | `{ enabled, lights, walls }` | `broadcastLighting` |
| `character_level_changed` | `campaign:<campaignId>` | `{ campaignId, characterId }` | `notifyCharacterLevelChanged` |
| `measure` | both map rooms except the sender | `{ senderId, measurement }` | `handleMeasure`, and `handleDisconnect` (sends `measurement: null` if the socket was mid-measure) |

Sources: `dnd_vtt_backend/src/maps/tokens.gateway.ts`, `dnd_vtt_backend/src/maps/player-tokens.ts` (`serializePlayerTokens`), `dnd_vtt_backend/src/maps/maps.service.ts` (callers).

## `EncounterPresenceGateway` (`src/encounters/encounter-presence.gateway.ts`)

Tracks which players have an encounter open, in an in-memory `Map<encounterId, Map<socketId, PresentPlayer>>`.

Client to server:

| Event | Payload | Behaviour |
|---|---|---|
| `watch_encounter_presence` | `encounterId` | DM side. After `encounterFor` access check, joins `encounter-presence:<id>` without appearing in the roster, then broadcasts the roster |
| `announce_presence` | `{ encounterId, characterId }` | Player side. Requires an active encounter (`requireActive`) and that the character is the user's `active` campaign member character, else `WsException`. Joins the room, records a `PresentPlayer` (username, character name, HP, max HP, portrait/avatar/token-border read from the stored character record, not the client payload), broadcasts |
| `leave_presence` | `encounterId` | Removes the socket from the roster, broadcasts |

On `disconnect`, the socket's recorded encounter (`client.data.presenceEncounterId`) is removed from the roster.

Server to client:

| Event | Room | Payload | Sent by method |
|---|---|---|---|
| `encounter_players_updated` | `encounter-presence:<id>` | `PresentPlayer[]` | `broadcast` |
| `turn_changed` | `encounter-presence:<id>` | `{ current_turn_token_id, current_turn_map_id, round_number }` | `broadcastTurnState` |
| `encounter_tokens_changed` | `encounter-presence:<id>` | `{ encounterId }` | `notifyTokensChanged` |
| `encounter_started` | `campaign:<campaignId>` | `{ encounterId, sessionId, campaignId, name }` | `notifyEncounterStarted` |
| `character_level_changed` | `campaign:<campaignId>` | `{ campaignId, characterId }` | `notifyCharacterLevelChanged` |
| `party_leveled` | `campaign:<campaignId>` | `{ campaignId, campaignName, level }` | `notifyPartyLeveled` (called from `CampaignsService`) |
| `character_updated` | `campaign:<campaignId>` | `{ campaignId, characterId }` | `notifyCharacterUpdated` (called from `CharacterRepository` and `InventoryService`) |

Sources: `dnd_vtt_backend/src/encounters/encounter-presence.gateway.ts`, `dnd_vtt_backend/src/encounters/encounters.service.ts`, `dnd_vtt_backend/src/campaigns/campaigns.service.ts`, `dnd_vtt_backend/src/characters/character-repository.ts`, `dnd_vtt_backend/src/characters/inventory.service.ts`.

## `CompanionsGateway` (`src/companions/companions.gateway.ts`)

Has no client-to-server handlers. `changed(campaignId, characterId, ownerResourcesChanged = false)` does nothing when `campaignId` is empty. Otherwise it emits to `campaign:<campaignId>`:

| Event | Payload | When |
|---|---|---|
| `companions_updated` | `{ characterId }` | Always |
| `character_updated` | `{ campaignId, characterId }` | Only when `ownerResourcesChanged` is true |

Payloads carry identifiers only; clients refetch through the normal access-checked endpoints. It relies on the `campaign:*` rooms joined by `EncounterPresenceGateway`. `CompanionsService` calls `changed` (`this.events.changed(...)`).

Sources: `dnd_vtt_backend/src/companions/companions.gateway.ts`.

## Limitations

- Everything is in-process memory: no custom socket.io adapter (for example Redis) is configured in the backend source, so only a single instance is supported.
- `character_level_changed` and `encounter_started` go to the whole campaign room; clients decide whether the event concerns them.
