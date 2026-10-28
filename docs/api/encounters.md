# API: encounter CRUD, start/stop, turn order, visibility and per-player levels under `/api/encounters`.

Last updated: 2026-10-28 (commit 00cb49a)

`EncountersController` has `@UseGuards(JwtGuard)` only. The owner is `encounters.dm_id` (creation is checked against the parent session's DM). Tables: [data-model.md](../data-model.md#sessions-and-encounters). Conventions: [README.md](README.md#conventions). Live presence and turn broadcasts use the gateways in [architecture/realtime.md](../architecture/realtime.md); `EncountersService` calls `EncounterPresenceGateway` and `TokensGateway`.

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/encounters` | JWT | Query `sessionId?`, `activeCampaignId?` | With `sessionId`: encounters of that session (DM: all; active member: only `visible_to_players = 1` and only if the session is visible). With `activeCampaignId` (and no `sessionId`): the campaign's single `active` encounter, DM only. Otherwise: all encounters the caller owns, newest first. Each encounter includes its `map_ids` levels |
| GET | `/encounters/:id` | JWT (DM) | none | The encounter; `403` for non-owners |
| GET | `/encounters/:id/player-state` | JWT | none | Player-safe encounter state. Non-owners must be active members and both the session and the encounter must be visible |
| GET | `/encounters/:id/turn-order` | JWT | none | Tokens of every level in turn order |
| GET | `/encounters/:id/my-level` | JWT | none | The level (map) this player is shown: the DM-chosen one, else the entry level, plus the level count |
| PUT | `/encounters/:id/player-levels/:characterId` | JWT (DM) | `{ map_id }` | Switches the level a character's player sees; `400` unless the map is a level of the encounter and that character has a token on it |
| POST | `/encounters` | JWT (session DM) | `{ name, session_id, map_id?, map_ids?, level_names?, monsters?, character_ids? }` | Creates the encounter. `map_ids` (ordered levels, entry first) supersedes `map_id`; `level_names` is keyed by map id |
| PUT | `/encounters/:id` | JWT (DM) | `{ name?, summary?, map_id?, map_ids?, level_names?, monsters?, character_ids? }` | Updates; `map_id: null` clears the entry level |
| DELETE | `/encounters/:id` | JWT (DM) | none | Deletes the encounter |
| POST | `/encounters/:id/start` | JWT (DM) | none | Sets `status = 'active'`, makes it visible to players, resets turn tracking to round 1 with no active turn. `400` if not attached to a session; `409` if another encounter in the campaign is already active |
| POST | `/encounters/:id/stop` | JWT (DM) | none | Sets `status = 'ended'`; returns the encounter |
| POST | `/encounters/:id/turn/next` | JWT (DM) | none | Advances the turn; `400` if there is no map or no tokens |
| POST | `/encounters/:id/turn/previous` | JWT (DM) | none | Steps the turn back; same preconditions |
| PATCH | `/encounters/:id/visibility` | JWT (DM) | `{ visible: boolean }` | Sets `visible_to_players` |

Route order matters: `:id/player-state`, `turn-order`, `my-level` and `player-levels/:characterId` are fixed sub-paths of `:id`.

Sources: `dnd_vtt_backend/src/encounters/encounters.controller.ts`, `dnd_vtt_backend/src/encounters/encounters.service.ts` (`findAllForUser`, `findBySession`, `findActiveForCampaign`, `findOne`, `setPlayerLevel`, `findMyLevel`, `findPlayerState`, `findTurnOrder`, `create`, `update`, `setVisibility`, `remove`, `start`, `stop`, `nextTurn`, `previousTurn`), `dnd_vtt_backend/src/encounters/dto/`.
