# Feature: sessions and encounters — session pages, building encounters, running combat as DM, joining as a player, and the table screen.

Last updated: 2026-10-28 (commit 00cb49a)

A campaign has sessions; a session has encounters; an encounter uses one or more battle maps ("levels") and has a roster of monsters and characters. Rules and endpoints: [api/sessions.md](../api/sessions.md), [api/encounters.md](../api/encounters.md), tables in [data-model.md](../data-model.md#sessions-and-encounters). The map canvas itself is [battle-map.md](battle-map.md).

## DM session page

**What the DM sees.** `/home/campaigns/manage/:campaignId/sessions/:sessionId` (`DmCampaignSessionComponent`): the session description and background (edit dialog, upload), the encounters of the session, the party roster (same member actions as the campaign hub: open/view character, edit access, party visibility, remove), and the embedded wiki ([wiki.md](wiki.md)). Per encounter: edit, delete (confirmation), show/hide to players, **Start** and **Stop**. Start is disabled while another encounter of the campaign is active or a start/stop request is in flight (`startDisabled`).

**Flow.** `EncounterService.getBySession` → `GET /api/encounters?sessionId=`; `start` → `POST /api/encounters/:id/start` (`409` if another encounter is active); `stop` → `POST /api/encounters/:id/stop`; `setVisibility` → `PATCH /api/encounters/:id/visibility`. Starting makes the encounter visible and emits `encounter_started` to the campaign room ([architecture/realtime.md](../architecture/realtime.md#encounterpresencegateway-srcencountersencounter-presencegatewayts)). Session create/delete/visibility/current-session are done from the campaign hub ([campaigns.md](campaigns.md#dm-campaign-hub)).

Sources: `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-campaign-session/dm-campaign-session.ts` (`startEncounter`, `stopEncounter`, `toggleVisibility`, `startDisabled`, `openEncounterDialog`), `dnd_vtt_frontend/src/app/core/services/encounter.service.ts`, `dnd_vtt_frontend/src/app/core/services/session.service.ts`, `dnd_vtt_backend/src/encounters/encounters.service.ts` (`start`, `stop`).

## Encounter form

**What the DM sees.** A dialog (`EncounterFormDialogComponent`) to create or edit an encounter: name, summary, a roster of monsters (from the merged static and homebrew list, see [content-library.md](content-library.md)) and of the DM's characters, and one or more **levels** (dungeon floors), entry level first, each with an optional name. A level's map is either an existing campaign map or a new file: PNG/JPEG/WebP (grid derived from the number of vertical squares entered, default 20) or a DungeonDraft Universal VTT `.dd2vtt` export, which carries the grid and walls. Walls from a `.dd2vtt` are stored with `BattleMapService.setWalls` after the map is created so dynamic lighting is blocked by them. A past encounter of the campaign can be used as a template (`applyTemplate`): its name, monsters, characters and map are copied, but not its recap; a map from another campaign is dropped with a notice.

**Flow.** New map files go through `POST /api/maps/upload` and `POST /api/maps`; the encounter is saved with `POST /api/encounters` or `PUT /api/encounters/:id` using `map_ids`, `level_names`, `monsters` and `character_ids` ([api/encounters.md](../api/encounters.md), [api/maps.md](../api/maps.md)). The dialog closes with `true` so the session page refetches.

Sources: `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-campaign-session/encounter-form-dialog/encounter-form-dialog.ts` (`LevelDraft`, `save`, `selectedCharacterIds`, `wallsFromUniversalVtt` caller), `dnd_vtt_backend/src/encounters/encounters.service.ts` (`create`, `update`).

## DM encounter play

**What the DM sees.** `/home/campaigns/manage/:campaignId/sessions/:sessionId/encounters/:encounterId` (`DmEncounterPlayComponent`, fully opaque background): a toolbar (level selector, start/stop, previous/next turn, back to session, "Open player view in a new window"), a roster panel (monsters, party members — connected or not — and companions), and the embedded battle map with `canControl` set to whether the user owns the encounter.

- **Placing tokens.** The DM "arms" a monster, a party character, a companion or a custom token in the roster and clicks the map to place it; monster size maps to grid cells (`monsterSizeCells`). A party member's token can be placed before the player joins.
- **Token panels.** Clicking a token opens a panel: monster (HP adjust, colour), character summary (darkvision override via `characters.update`, open the full play sheet, [characters.md](characters.md)), custom token (label, colour, size, remove), or companion sheet ([companions.md](companions.md)).
- **Roster edits.** Monsters can be added or removed from the encounter while it runs (`addMonsterToEncounter`, `removeMonsterFromEncounter`); removing only takes it off the roster, tokens already on the map stay.
- **Turns.** `nextTurn`/`previousTurn` → `POST /api/encounters/:id/turn/next|previous`; the view follows the active token across levels (`followTurn`).
- **Levels.** The DM chooses which level to view; "move to level" (stairs) moves the selected token with `POST /api/maps/:id/tokens/:tokenId/move`, and a character token's player follows it. "Show level to player" sets `PUT /api/encounters/:id/player-levels/:characterId`.
- **Live data.** Presence (`watchPresence`), turn order across levels (`watchTurnOrder`) and character updates (`watchCharacterUpdated`) are socket subscriptions; companions are watched per character (`CompanionService.watch`). Events: [architecture/realtime.md](../architecture/realtime.md).

Monsters offered are filtered by the campaign's `allowed_sources` (`campaignContentEnabled`).

Sources: `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-encounter-play/dm-encounter-play.ts` (`ngOnInit`, `nextTurn`, `moveSelectedTokenToLevel`, `showTokenLevelToPlayer`, `addMonsterToEncounter`, `toggleArm*`, `onTokenClicked`, `openPlayerView`), `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-encounter-play/components/` (`roster-panel`, `encounter-toolbar`, `monster-token-detail`, `character-token-detail`, `custom-token-editor`), `dnd_vtt_backend/src/encounters/`, `dnd_vtt_backend/src/maps/maps.service.ts` (`moveTokenToMap`).

## Player session page

**What the player sees.** `/home/campaigns/:campaignId/sessions/:sessionId` (`PlayerCampaignSessionComponent`): the session description, the encounters the DM made visible, the party list, the campaign wiki or the player's own character sheet (`HubViewService`), and a **Join** button on an encounter. Joining switches the page to the battle map for that encounter, shows the player's own level (a multi-level encounter shows only the level the DM assigned), and lists the present players. The turn order panel stays hidden until round 2 (`showTurnOrder` is `round_number >= 2`).

**Flow.** `join(encounter)` loads the character and `GET /api/encounters/:id/my-level`, then sends `announce_presence` (character name, HP, portrait data from the sheet), subscribes to presence, `turn_changed`, turn order and `character_level_changed`, and refetches the level on each turn change as a safety net. The map component receives `canControl=false` plus the player's character, movement speed and darkvision, so the player cannot drag tokens; they can see their move range and pick a destination for their token, which the DM sees on their turn ([battle-map.md](battle-map.md#player-features)). Leaving sends `leave_presence`.

**Auto-join and rejoin.** `?autojoin=<encounterId>` joins automatically (used by the shell banner and the "current encounter" route, [shell-and-dashboard.md](shell-and-dashboard.md#shell)). The current encounter id is kept in `sessionStorage` under `dnd-player-campaign-encounter`, so a page refresh re-enters it until the player presses Leave. The background overlay is forced fully opaque while in an encounter and restored on leave (`BackgroundService.setPageOverlay`).

**Limitations.** Presence and level state live in memory on the server ([architecture/realtime.md](../architecture/realtime.md#limitations)); a missed broadcast is corrected only by the next turn change or reload.

Sources: `dnd_vtt_frontend/src/app/features/player/player-campaigns/player-campaign-session/player-campaign-session.ts` (`ngOnInit`, `join`, `refreshMyLevel`, `leaveEncounter`, `announceSelf`, `REJOIN_KEY`), `dnd_vtt_frontend/src/app/features/player/player-campaigns/player-campaign-session/player-campaign-session.html`, `dnd_vtt_frontend/src/app/core/services/encounter.service.ts`, `dnd_vtt_backend/src/encounters/encounter-presence.gateway.ts`.

## Table screen (player view)

**What it is.** `/encounters/:encounterId/player-view` (`PlayerViewComponent`, outside the `home` shell, fully opaque) is a read-only view meant to be popped out of the DM's encounter page onto a second monitor (`DmEncounterPlayComponent.openPlayerView` opens it in a new window). It renders the battle map with `canControl=false` and `viewAsPlayers=true`, so hidden tokens, masked names and DM-only stats are stripped in the browser (`tokensAsPlayersSee`, `lightingAsPlayersSee`), and shows present players, the turn order from round 2 on, and darkvision for every party character. For a multi-level encounter it follows the level of the current-turn token (the entry level until turns start).

**Flow.** It loads `GET /api/encounters/:id` — a DM-only route — and fetches every character with a token with the DM's access ([api/characters.md](../api/characters.md#access-rules)); so only the encounter's DM can use it. It watches presence, turn order, turn state and `character_updated`.

Sources: `dnd_vtt_frontend/src/app/features/player/player-view/player-view.ts` (`ngOnInit`, `levelMapId`), `dnd_vtt_frontend/src/app/features/player/player-view/player-view.html`, `dnd_vtt_frontend/src/app/core/utils/player-perspective.ts`, `dnd_vtt_backend/src/encounters/encounters.controller.ts`.
