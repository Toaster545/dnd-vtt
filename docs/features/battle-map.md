# Feature: battle map — the Konva canvas for tokens, fog of war, dynamic lighting, walls, measuring and turn tracking.

Last updated: 2026-10-28 (commit 00cb49a)

`BattleMapComponent` (`features/battle-map/`) is one reusable canvas. It is routed on its own and embedded in the DM encounter page, the player session page and the table screen ([sessions-and-encounters.md](sessions-and-encounters.md)). REST: [api/maps.md](../api/maps.md); socket events and rooms: [architecture/realtime.md](../architecture/realtime.md#tokensgateway-srcmapstokensgatewayts); tables: [data-model.md](../data-model.md#battle-maps).

## Where it appears

| Host | How | Control |
|---|---|---|
| `/battle-map` and `/battle-map/:id` (`authGuard`, `staleSessionGuard`) | Routed, standalone; the id comes from the route | `controlsMap` = not embedded and `AuthService.isAdmin()` (account role `admin`, not campaign ownership) |
| DM encounter play | `<app-battle-map>` with `canControl` = encounter owner | Full DM tools |
| Player session page | `canControl=false`, with `myCharacterId`, `myMoveSpeedFt`, `myDarkvisionFt`, `myCharacter` | Read-only plus player tools below |
| Table screen | `canControl=false`, `viewAsPlayers=true` | Read-only, player perspective |

Inputs and outputs (`mapIdInput`, `embedded`, `placingEntity`, `characterHp`, `characterPortraits`, `characterTokenBorders`, `currentTurnTokenId`, `turnOrderTokens`, `showTurnOrder`, `canControl`, `viewAsPlayers`, `tokenClicked`, `currentTurnTokenChanged`, `characterSaved`) are declared at the top of the class. The `/battle-map` route is linked from the DM maps page ("Open in VTT", [campaigns.md](campaigns.md#dm-maps-page)).

Sources: `dnd_vtt_frontend/src/app/features/battle-map/battle-map.ts` (`controlsMap`, inputs), `dnd_vtt_frontend/src/app/app.routes.ts`, `dnd_vtt_frontend/src/app/features/battle-map/battle-map.html`.

## Live data

`BattleMapService` joins the socket room with `join_map` and re-joins and refetches on every `connect`, because socket.io does not keep room membership across reconnects. It exposes `watchTokens` (`tokens_updated`), `watchFog` (`fog_updated`, `fog_cells`), `watchLighting` (`lighting_updated`) and `watchMeasurements` (`measure`), and `watchTokens` also listens to `companions_updated` and `character_updated` to refresh companion tokens. The server sends the DM the full state and players a redacted copy (`serializePlayerTokens`; lights without labels); the client does not receive hidden tokens. Leaving the page sends `leave_map`.

Sources: `dnd_vtt_frontend/src/app/core/services/battle-map.service.ts` (`joinMapRoom`, `watchTokens`, `watchFog`, `watchLighting`, `watchMeasurements`), `dnd_vtt_backend/src/maps/tokens.gateway.ts`, `dnd_vtt_backend/src/maps/player-tokens.ts`.

## DM tools

Toolbar (`MapToolbarComponent`, tooltips from `map-toolbar.html`):

| Tool | Behaviour | Endpoint |
|---|---|---|
| Select / move | Pointer; drag a token to a square | `POST /maps/:id/tokens` (upsert with new `x`, `y`) |
| Measure: line, cone, sphere | Ruler in grid units, 5 ft per square (`FEET_PER_SQUARE`); live to other viewers, never persisted | socket `measure` |
| Fog on/off, brush hide/reveal, rectangle hide/reveal, reveal all | Whole-cell fog; the map starts fully visible | `POST /maps/:id/fog/toggle`, `/fog/paint`, `/fog/reset` |
| Darkness on/off | Dynamic lighting; the map starts fully lit | `POST /maps/:id/lighting/toggle` |
| Place torch | Click the map (standalone light) or a token (attached light follows it); edit bright/dim radius, colour, label in `LightEditorPanelComponent` | `POST /maps/:id/lighting/lights`, `DELETE .../lights/:lightId` |
| Draw walls / erase walls | Click to chain segments, right-click or double-click to finish; walls block light and are saved as one set | `PUT /maps/:id/lighting/walls` |
| Ambient level and colour | Darkness wash outside torchlight | `PUT /maps/:id/lighting/ambient` |

Other DM behaviours:

- **Turn trail.** Dragging a token shows the path cost using the same diagonal rule as the server (`turn-trail-renderer.ts` mirrors `maps/movement.ts`); the DM confirms or undoes the move with `POST .../move/confirm` and `.../move/undo`.
- **Token removal and initiative.** Right-click a token to remove it (`DELETE /maps/:id/tokens/:tokenId`, after a confirmation dialog); initiative can be edited or rerolled for monsters (`POST .../reroll-initiative`) from the turn order panel (`TurnOrderPanelComponent`).
- **View.** Zoom, rotate in 15° steps, reset, fit map, fullscreen. Panel widths and collapse state are kept in `localStorage` (`dnd-battlemap-turn-w`, `dnd-battlemap-sheet-w`, `dnd-battlemap-turn-col`, `dnd-battlemap-sheet-col`).
- **Darkvision.** A party character's `darkvision_ft` can be set from the encounter page ([sessions-and-encounters.md](sessions-and-encounters.md#dm-encounter-play)). The DM's darkness overlay is drawn lighter than the players' (`renderDarkness` scales alpha when `isAdmin`).

Sources: `dnd_vtt_frontend/src/app/features/battle-map/components/map-toolbar/map-toolbar.html`, `dnd_vtt_frontend/src/app/features/battle-map/battle-map.ts` (`toggleFogTool`, `toggleLightTool`, `commitWalls`, `setAmbientLevel`, `removeToken`, `setInitiative`, `rerollInitiative`, `moveActions`), `dnd_vtt_frontend/src/app/features/battle-map/canvas/` (`fog-tool.ts`, `wall-tool.ts`, `lighting-renderer.ts`, `measurement-tool.ts`, `turn-trail-renderer.ts`, `visibility.ts`), `dnd_vtt_backend/src/maps/maps.controller.ts`, `dnd_vtt_backend/src/maps/movement.ts`.

## Player features

- **Fog and darkness** are rendered opaque for players; with darkness on, an enemy token is shown only inside a light's reach or the player's own darkvision, stopped by walls (`tokensHiddenByDarkness`, `isTokenLit`). Party members are always shown.
- **Move range.** "Show my movement range" highlights reachable squares for the player's token from `myMoveSpeedFt`, with the diagonal rule (`renderMoveRange`).
- **Destination.** "Pick where you'd like to move" stores a planned destination for the player's token (`PUT /maps/:id/tokens/:tokenId/plan`, cleared with `DELETE`); the DM sees it on that token's turn. The server clears it when the turn changes, and the client refetches on each turn change.
- **Players cannot drag tokens** (`draggable` is tied to `controlsMap`); the DM moves them.
- **Side panel.** Turn order (from round 2, controlled by the host) and, in the player session, a collapsible character sheet.

Sources: `dnd_vtt_frontend/src/app/features/battle-map/battle-map.ts` (`tokensHiddenByDarkness`, `togglePickDestination`, `setMyPlan`, `planMarker`), `dnd_vtt_frontend/src/app/features/battle-map/canvas/move-range-renderer.ts`, `dnd_vtt_frontend/src/app/features/battle-map/canvas/token-renderer.ts` (`draggable`), `dnd_vtt_backend/src/maps/maps.service.ts` (plan routes).

## Canvas modules

All under `features/battle-map/canvas/`: `stage-view.ts` (pan, zoom, rotation), `stage-pointer-tools.ts`, `grid-renderer.ts` (grid drawn as a single Konva shape for performance), `token-renderer.ts` (token circle, label, HP badge as one shape), `portrait-cache.ts` and `token-image-cache.ts`, `fog-tool.ts`, `lighting-renderer.ts` (one darkness shape plus torch markers), `visibility.ts` (light visibility polygons clipped by walls), `wall-tool.ts`, `measurement-tool.ts`, `move-range-renderer.ts`, `plan-marker-renderer.ts`, `turn-trail-renderer.ts`.

Sources: `dnd_vtt_frontend/src/app/features/battle-map/canvas/*.ts`.

## Limitations

- Movement distance assumes 5 ft per square (`FEET_PER_SQUARE`); maps have no per-map scale.
- Move range is cost-only; it ignores walls and terrain (`move-range-renderer.ts`).
- `components/add-token-panel/` defines `AddTokenPanelComponent` but no template uses `<app-add-token-panel>` (token placement comes from the encounter roster, [sessions-and-encounters.md](sessions-and-encounters.md#dm-encounter-play)).
- The standalone `/battle-map` route gives control only to accounts with role `admin`; a campaign DM without the admin role sees a read-only map there and should use the encounter page.

Sources: `dnd_vtt_frontend/src/app/features/battle-map/canvas/measurement-tool.ts`, `dnd_vtt_frontend/src/app/features/battle-map/canvas/move-range-renderer.ts`, `dnd_vtt_frontend/src/app/features/battle-map/components/add-token-panel/add-token-panel.ts`.
