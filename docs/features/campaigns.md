# Feature: campaigns — creating and joining campaigns, the DM hub, the player hub, and the "current game" shortcuts.

Last updated: 2026-10-28 (commit 00cb49a)

Every user can both create campaigns (becoming that campaign's DM, `campaigns.dm_id`) and join others (becoming a member with a copy of one of their characters). There is no role-gated path; `CampaignsComponent.campaignLink` picks `/home/campaigns/manage/:id` when `is_owner`, else `/home/campaigns/:id`. Backend rules: [api/campaigns.md](../api/campaigns.md); tables: [data-model.md](../data-model.md#campaigns).

## Campaign list

**What the user sees.** `/home/campaigns` lists owned and joined campaigns. A form creates a campaign (name, description, allowed content sources) or joins one by join code with a chosen character. The dashboard opens the form with `?action=create` or `?action=join`. A DM can delete a campaign or upload/clear its background image from the list.

**Flow.**
1. `load()` fetches `CampaignService.getAll`, `CharacterService.getMyCharacters` and `ContentService.getSources` in parallel.
2. Create: `CampaignService.create(name, description, allowedSources)` → `POST /api/campaigns`. The preselected sources are those with `player_options` and (`default_enabled` or `locked`); locked sources cannot be unticked.
3. Join: typing a 6-character code (upper-cased) calls `previewJoin` → `GET /api/campaigns/join-preview/:joinCode`, which returns per-character compatibility with the campaign's `allowed_sources`; incompatible characters cannot be selected. `join` → `POST /api/campaigns/join` makes the campaign copy ([characters.md](characters.md#personal-characters-and-campaign-copies)).
4. Delete → `DELETE /api/campaigns/:id` (confirmation dialog); background → `POST /api/campaigns/:id/background` or `PATCH /api/campaigns/:id` with `background_url: null`.

**Limitations.** Only personal characters (not campaign copies) can be used to join; the backend returns `403` otherwise.

Sources: `dnd_vtt_frontend/src/app/features/campaigns/campaigns.ts` (`CampaignsComponent`, `load`, `onJoinCodeChange`, `createCampaign`, `join`, `campaignLink`), `dnd_vtt_frontend/src/app/core/services/campaign.service.ts`, `dnd_vtt_backend/src/campaigns/campaigns.service.ts` (`findAllForUser`, `previewJoin`, `join`).

## DM campaign hub

**What the DM sees.** `/home/campaigns/manage/:campaignId` (`DmCampaignHubComponent`):

- campaign header with a copy-join-code button, description editor (`openDescriptionDialog`) and background upload;
- allowed content sources: toggling a source saves it to the campaign (`PATCH /api/campaigns/:id` with `allowed_sources`);
- sessions: create, delete, show/hide to players, and mark one as the campaign's **current** session ([sessions-and-encounters.md](sessions-and-encounters.md));
- party roster: for each member the character summary, an edit-access lock (`PATCH .../members/:userId/edit-access`), party-list visibility (`.../party-visibility`), removal (`DELETE .../members/:userId`), and open sheet / open wizard for the member's copy;
- party level: set a level directly (`applyPartyLevel`) or "Level Party Up" with confirmation (`levelPartyUp`, max 20), both `PATCH /api/campaigns/:id/party-level`. Members then see a pending level-up and the `party_leveled` banner ([shell-and-dashboard.md](shell-and-dashboard.md#shell)). Max HP shown in the roster is recomputed in the browser (`loadMemberMaxHp`) because the server does not recompute HP on a party-level change;
- an embedded campaign wiki panel ([wiki.md](wiki.md)) that opens on a page named like the campaign when one exists;
- a link to the maps page ("Upload and manage battle maps"); the embedded wiki switches to the full workspace through its own toggle (`WikiEmbedComponent`).

The hub embeds `CharacterWizardComponent` and `CharacterPlaySheetComponent` so the DM can edit or view a member's character without leaving the page ([character-wizard.md](character-wizard.md), [characters.md](characters.md)). Opening the page records a view (`RecentActivityService.markCampaignViewed`, and `GET /api/campaigns/:id` records a `campaign_visits` row).

Sources: `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-campaign-hub/dm-campaign-hub.ts` (`load`, `toggleAllowedSource`, `createSession`, `setCurrentSession`, `applyPartyLevel`, `levelPartyUp`, `removeMember`, `toggleEditAccess`, `togglePartyVisibility`, `loadMemberMaxHp`), `dnd_vtt_backend/src/campaigns/campaigns.service.ts` (`setPartyLevel`, `removeMember`).

## DM maps page

**What the DM sees.** `/home/campaigns/manage/:campaignId/maps` lists the campaign's battle maps and uploads a new one: choose an image, name it, and set the grid by entering the number of vertical squares; a preview overlays the resulting grid (`gridSize` = image height ÷ vertical squares, rounded). Maps used by encounters can also be created from the encounter form ([sessions-and-encounters.md](sessions-and-encounters.md#encounter-form)).

**Flow.** `BattleMapService.getMapsForCampaign` → `GET /api/maps?campaignId=`; upload → `POST /api/maps/upload?campaignId=` then `POST /api/maps` with `{ campaign_id, name, image_url, grid_size }` ([api/maps.md](../api/maps.md)). Each map card has an "Open in VTT" link to `/battle-map/:id` ([battle-map.md](battle-map.md)).

Sources: `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-campaign-maps/dm-campaign-maps.ts` (`loadMaps`, `onFileChange`, `upload`).

## Player campaign hub

**What the player sees.** `/home/campaigns/:campaignId` (`PlayerCampaignHubComponent`): the campaign, its visible sessions, the party list (members the DM made visible, plus the player's own row), and a main column that switches between the campaign wiki and the player's own character sheet (`HubViewService`, key `dnd-vtt-hub-view`; sidebar width key `dnd-vtt-hub-sidebar-width`, clamped 240–640 px). The player can edit their own campaign copy in the wizard (only as far as the DM-locked rules allow, see [characters.md](characters.md#personal-characters-and-campaign-copies)), toggle whether race and class are shown to the party (`PATCH .../members/me/race-class-visibility`), start a pending level-up, or leave the campaign (`DELETE .../members/me`, confirmation).

**Flow.** `ngOnInit` loads the campaign (`GET /api/campaigns/:id`) and calls `PlayerContextService.selectCampaign`, then loads the player's own character. Sessions the DM hid are not returned by the API.

Sources: `dnd_vtt_frontend/src/app/features/player/player-campaigns/player-campaign-hub/player-campaign-hub.ts` (`ngOnInit`, `leaveCampaign`, `toggleRaceClassVisibility`, `levelUpMyCharacter`), `dnd_vtt_frontend/src/app/core/services/hub-view.service.ts`, `dnd_vtt_frontend/src/app/shared/components/party-list/`.

## Current game shortcuts

**What the user sees.** Routes `/home/campaign/current`, `/current-session`, `/current-encounter` and `/current-map` open the right place without knowing ids; they back the mobile bottom navigation of the shell (Home, Character, Campaign, Encounter, Map). If nothing is current the page says "Nothing current yet" and offers "Choose campaign" (`/home/campaigns`).

**Flow.** `PlayerContextService.load()` calls `GET /api/player/bootstrap` ([api/player.md](../api/player.md)); the component reads `selected_campaign_id` and `current_context`, and the route's `data.target` decides the destination:

| Target | Destination |
|---|---|
| `campaign` | `/home/campaigns/:campaignId` |
| `session` | `/home/campaigns/:campaignId/sessions/:currentSessionId` |
| `encounter` | the session page with `?autojoin=<encounterId>` |
| `map` | `/encounters/:currentEncounterId/player-view` (the DM-only table screen, see [sessions-and-encounters.md](sessions-and-encounters.md#table-screen-player-view)) |

The DM sets the current session with `PATCH /api/campaigns/:id/current-session` from the hub.

**Limitations.** The `map` target leads to the table screen, which loads the encounter with `GET /api/encounters/:id`; that route is DM-only ([api/encounters.md](../api/encounters.md)), so a non-owner reaches it with a `403`.

Sources (mobile nav): `dnd_vtt_frontend/src/app/features/shell/shell.html` (`mobile-player-nav`).

Sources: `dnd_vtt_frontend/src/app/features/player/current-player-route/current-player-route.ts` (`load`), `dnd_vtt_frontend/src/app/app.routes.ts`, `dnd_vtt_frontend/src/app/core/services/player-context.service.ts`, `dnd_vtt_backend/src/player/player.service.ts` (`bootstrap`).
