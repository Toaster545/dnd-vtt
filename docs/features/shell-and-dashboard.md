# Feature: shell and dashboard — the post-login frame (tabs, live alerts) and the landing dashboard.

Last updated: 2026-10-28 (commit 00cb49a)

## Shell

**What the user sees.** Every logged-in page under `/home/*` is rendered inside `ShellComponent` (`features/shell/`): `AppHeaderComponent` with a Dashboard button, the tabs Characters, Campaigns and Content Library, and a Settings button ([accounts-and-settings.md](accounts-and-settings.md#settings-dialog)). On narrow screens a bottom navigation (`mobile-player-nav`) links Home, Character, Campaign, Encounter and Map; the last three are the "current game" routes in [campaigns.md](campaigns.md#current-game-shortcuts). There is no DM/player split of the UI; a user is a DM only of campaigns they created ([campaigns.md](campaigns.md)).

The highlighted tab is derived from the URL (`syncActiveTabFromUrl`): `/home/dashboard`, `/home/content-library`, `/home/campaigns*`, everything else counts as Characters.

**Live alerts.** On init the shell loads the user's campaigns and keeps the ids of those the user joined but does not own (`is_owner` false). It then subscribes to two socket events through `EncounterService`:

| Event (see [architecture/realtime.md](../architecture/realtime.md#encounterpresencegateway-srcencountersencounter-presencegatewayts)) | Banner |
|---|---|
| `encounter_started` | "went live" banner; its action navigates to `/home/campaigns/:campaignId/sessions/:sessionId?autojoin=<encounterId>`, which joins the encounter ([sessions-and-encounters.md](sessions-and-encounters.md#player-session-page)) |
| `party_leveled` | Level-up banner, shown only if the user's campaign copy of the character has `applied_level` below `level`; its action opens `/home/characters/:id/level-up` ([character-wizard.md](character-wizard.md#level-up-mode)) |

Both are ignored for campaigns the user owns or has not joined. The banners are not persisted; they exist until dismissed or the page reloads.

Sources: `dnd_vtt_frontend/src/app/features/shell/shell.ts` (`ShellComponent`, `syncActiveTabFromUrl`, `onPartyLeveled`, `joinLiveAlert`, `openLevelUpAlert`), `dnd_vtt_frontend/src/app/app.routes.ts`, `dnd_vtt_frontend/src/app/core/services/encounter.service.ts` (`watchEncounterStarted`, `watchPartyLeveled`).

## Dashboard

**What the user sees.** `/home/dashboard` (also reached by `/dashboard` and the post-login redirect) summarises the user's recent work:

- recent characters and campaigns (up to three each, ordered by recent views via `RecentActivityService`, then last update);
- pinned ("favourite") characters and campaigns;
- an "attention" count made of draft characters (`creation_status === 'draft'`) and pending level-ups;
- shortcuts to create a character and to create or join a campaign (`/home/campaigns?action=create|join`, handled in [campaigns.md](campaigns.md#campaign-list)).

**Flow.** `DashboardComponent.ngOnInit` loads personal characters (`getMyCharacters`), campaign copies (`getMyCampaignCopies`) and campaigns (`CampaignService.getAll`) in parallel, then looks for level-ups: for every campaign copy it loads class, race, feats, items and backgrounds from `ContentService`, computes stats with `CharacterStatsService` and flags the character when `levelUpPending(char, stats.suggested_max_hp)` is true. Links go to the editor for drafts (`/home/characters/:id/edit`), otherwise to the sheet; a campaign links to `/home/campaigns/manage/:id` when `is_owner`, else `/home/campaigns/:id`. Endpoints: [api/characters.md](../api/characters.md), [api/campaigns.md](../api/campaigns.md), [api/content.md](../api/content.md).

**Pins** are stored in `localStorage` under `natone-dashboard-favorites:<profile id>` (`{ characters: string[], campaigns: string[] }`). They are per browser, not synced to the server.

**Limitations.** The level-up check runs in the browser and fetches content per character, so it grows with the number of campaign copies. Legacy copies without `applied_level` are judged by the HP-staleness comparison, not by the marker ([characters.md](characters.md)).

Sources: `dnd_vtt_frontend/src/app/features/dashboard/dashboard.ts` (`ngOnInit`, `findLevelUpAlerts`, `favoritesKey`, `campaignLink`, `characterLink`), `dnd_vtt_frontend/src/app/core/services/recent-activity.service.ts`.
