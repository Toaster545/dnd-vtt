# API: battle maps, tokens, token movement, fog of war and dynamic lighting under `/api/maps`.

Last updated: 2026-10-28 (commit 00cb49a)

`MapsController` has `@UseGuards(JwtGuard)` only. Access is resolved in `MapsService`:

- **DM** = the caller owns the map's campaign (`campaigns.dm_id`). For maps whose `campaign_id` is the pseudo-campaign `'default'`, "DM" means `role = 'admin'`.
- **Reader** = DM, or an active campaign member for a map that is a level of a visible encounter in a visible session (`CampaignAccessService.isMapRevealedToPlayers`); other callers get `403`. Non-DM readers receive reduced payloads (map: `id`, `campaign_id`, `name`, `grid_size`, `visibility_revision`, `image_url`, `created_at`; tokens filtered by `serializePlayerTokens`; lights without labels).
- **Own token or DM** = the DM, or the owner of the character behind a player token, or the owner of the character behind a companion token.

Tables: [data-model.md](../data-model.md#battle-maps). Conventions: [README.md](README.md#conventions). Every mutation below that changes tokens, fog or lighting is also broadcast over socket.io; the events and rooms are in [architecture/realtime.md](../architecture/realtime.md#tokensgateway-srcmapstokensgatewayts).

## Maps

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/maps` | JWT | Query `campaignId` | DM: all maps of the campaign. Active member: only revealed maps. Others: `403` |
| GET | `/maps/:id` | JWT (reader) | none | The map (reduced for non-DM) |
| GET | `/maps/:id/player-state` | JWT (reader) | none | `{ map, tokens, fog, lighting }`, filtered for non-DM |
| GET | `/maps/:id/image` | JWT (reader) | none | Streams the image file with `Cache-Control: private, no-store`. `404` unless `image_url` is under `uploads/maps/` and the file exists |
| POST | `/maps` | JWT (DM) | `{ name, image_url, campaign_id?, grid_size? (int ≥ 1) }` | Creates the map. `campaign_id` defaults to `'default'` (admins only) |
| POST | `/maps/upload` | JWT (DM) | Query `campaignId`; multipart `file` | Saves the image under `uploads/maps/<campaignId>/`; returns `{ url }` |

## Tokens

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/maps/:id/tokens` | JWT (reader) | none | Tokens; players get the filtered form |
| POST | `/maps/:id/tokens` | JWT (DM) | Token fields, all optional: `id`, `label`, `color`, `x`, `y`, `size`, `hp`, `max_hp`, `is_player`, `character_id`, `monster_index`, `companion_id`, `initiative`, `visible_to_players`, `name_visible_to_players` | Create (no `id`) or update. Flags may be sent as `0`/`1`. Server-owned columns (`map_id`, planned and turn-tracking fields) are stripped. `404` unknown token or companion; `403` if the companion belongs to another campaign |
| DELETE | `/maps/:id/tokens/:tokenId` | JWT (DM) | none | Deletes the token |
| POST | `/maps/:id/tokens/:tokenId/move` | JWT (DM) | `{ target_map_id }` | Moves the token to another map; `400` if the target is in another campaign |
| POST | `/maps/:id/tokens/:tokenId/color` | JWT (own token or DM) | `{ color: '#rrggbb' }` | Cosmetic colour change |
| POST | `/maps/:id/tokens/:tokenId/move/confirm` | JWT (DM) | none | Accepts the token's pending move: adds its cost to `turn_moved_ft` and moves the anchor. `400` unless the token is taking its turn (it has a confirmed anchor) |
| POST | `/maps/:id/tokens/:tokenId/move/undo` | JWT (DM) | none | Returns the token to its last confirmed square; same `400` |
| GET | `/maps/:id/tokens/:tokenId/plan` | JWT (own token or DM) | none | The token's planned destination |
| PUT | `/maps/:id/tokens/:tokenId/plan` | JWT (own token or DM) | `{ x, y }` (ints ≥ 0, grid squares) | Sets `planned_x`/`planned_y` |
| DELETE | `/maps/:id/tokens/:tokenId/plan` | JWT (own token or DM) | none | Clears the plan |
| POST | `/maps/:id/tokens/:tokenId/reroll-initiative` | JWT (DM) | none | Rerolls initiative; `400` unless it is a monster token |

## Fog of war

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/maps/:id/fog` | JWT (reader) | none | `map_fog` state (`enabled`, hidden cells) |
| POST | `/maps/:id/fog/toggle` | JWT (DM) | `{ enabled: boolean }` | Enables or disables fog |
| POST | `/maps/:id/fog/paint` | JWT (DM) | `{ cells: [{ col, row }], revealed: boolean }` | `revealed: true` un-hides the cells, `false` hides them |
| POST | `/maps/:id/fog/reset` | JWT (DM) | none | Resets fog |

## Lighting

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/maps/:id/lighting` | JWT (reader) | none | `{ enabled, lights, walls, ambient_level, ambient_color }`. Non-DM readers get the same fields but only standalone lights and lights of visible tokens, with empty labels. (The `lighting` object inside `player-state` carries only `enabled` and the filtered `lights`.) |
| POST | `/maps/:id/lighting/toggle` | JWT (DM) | `{ enabled: boolean }` | Turns dynamic lighting on or off |
| PUT | `/maps/:id/lighting/walls` | JWT (DM) | `{ walls: [{ x1, y1, x2, y2 }] }` | Replaces the full wall set; the service enforces a per-map cap |
| PUT | `/maps/:id/lighting/ambient` | JWT (DM) | `{ level: 0–100, color: '#rrggbb' }` | Sets ambient level and colour |
| POST | `/maps/:id/lighting/lights` | JWT (DM) | `{ id?, token_id?, x?, y?, bright_radius_ft?, dim_radius_ft?, color?, enabled?, label? }` | Create or update a light. Standalone lights need `x` and `y`; a light with `token_id` follows that token (`400` if the token is not on this map) |
| DELETE | `/maps/:id/lighting/lights/:lightId` | JWT (DM) | none | Deletes the light |

Sources: `dnd_vtt_backend/src/maps/maps.controller.ts`, `dnd_vtt_backend/src/maps/maps.service.ts` (`findAll`, `getPlayerState`, `getImageFile`, `upsertToken`, `moveTokenToMap`, `setTokenColor`, `assertOwnTokenOrDm`, `confirmTokenMove`, `undoTokenMove`, `rerollInitiative`, `getFog`, `paintFog`, `getLighting`, `setWalls`, `upsertLight`, `assertCampaignAccess`, `isCampaignDm`, `resolveMapReadAccess`, `serializeMap`), `dnd_vtt_backend/src/maps/dto/`, `dnd_vtt_backend/src/maps/player-tokens.ts`, `dnd_vtt_backend/src/campaigns/campaign-access.service.ts`.
