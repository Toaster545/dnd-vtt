# Feature: characters — the character list, the play sheet (stats, actions, inventory, spells, notes), portraits, rests and level-up entry points.

Last updated: 2026-10-28 (commit 00cb49a)

Creation and editing in the wizard is in [character-wizard.md](character-wizard.md); companions are in [companions.md](companions.md). Endpoints and write rules: [api/characters.md](../api/characters.md); storage and the `data` blob: [data-model.md](../data-model.md#characters).

## Personal characters and campaign copies

A **personal character** (`campaign_id` empty) belongs to its user and is fully editable. Joining a campaign creates a **campaign copy** ([campaigns.md](campaigns.md#campaign-list)); the personal original stays. A copy is locked to the DM's wizard rules: the owner may change only the player-editable fields (HP, resource and spell usage, equipment, currency, portrait and token border, name, ...) unless the DM unlocks full editing per member (`campaign_members.edit_unlocked`). The backend enforces this independently of the UI ([api/characters.md](../api/characters.md#access-rules)).

Sources: `dnd_vtt_backend/src/characters/characters.service.ts` (`update`, `PLAYER_EDITABLE_FIELDS`), `dnd_vtt_backend/src/campaigns/campaigns.service.ts` (`join`).

## Character list

**What the user sees.** `/home/characters` (`CharactersComponent`; `/home` redirects here) lists personal characters and campaign copies together, ordered by recent views (`RecentActivityService.sortByRecentlyViewed`). Each row has a portrait and class label (`subclass (class)`), and actions: view sheet, edit (only when `canEdit`: personal, or a copy with `edit_unlocked`), level up (when `applied_level < level`), delete (confirmation), and a create button (`/home/characters/new`). Clicking a row opens the editor if editable, else the sheet.

**Flow.** `GET /api/characters` (personal) and `GET /api/characters/copies` (copies with `campaign_name`, `edit_unlocked`) in parallel; delete → `DELETE /api/characters/:id`. Unfinished characters (`creation_status = 'draft'`) are listed like others and open in the wizard.

Sources: `dnd_vtt_frontend/src/app/features/characters/characters.ts` (`load`, `canEdit`, `openRow`, `levelUpPendingFor`, `deleteCharacter`), `dnd_vtt_frontend/src/app/core/services/character.service.ts` (`getMyCharacters`, `getMyCampaignCopies`).

## Sheet page

`/home/characters/:id` (`CharacterSheetPageComponent`) loads the character (`GET /api/characters/:id`), marks it viewed, calls `PlayerContextService.selectCharacter`, and hosts `CharacterPlaySheetComponent`. Its buttons: back to the list (or to the wizard when opened with `?from=wizard`), edit (only for a character with no `campaign_id`), and open the campaign (for a copy).

Sources: `dnd_vtt_frontend/src/app/features/characters/character-sheet-page/character-sheet-page.ts`.

## Play sheet

`CharacterPlaySheetComponent` (`character-play-sheet/`, about 2000 lines) is the interactive sheet. It is reused by the sheet page, the DM campaign hub and session pages, the DM encounter page, the battle-map side panel and the wizard preview. Inputs: `character` (required), `isDm`, `compact`, `preview`; output `saved`. When the character changes it loads class, race, background, feats, items and spells from `ContentService` ([architecture/content.md](../architecture/content.md)) and derives everything with `CharacterStatsService` and the helpers in `core/utils/` ([architecture/frontend-core.md](../architecture/frontend-core.md)); the stored `armor_class` is re-synced from the computed value on every save.

**Tabs** (`Tab` type): Stats, Actions, Inventory, Spells, Companions, Notes. Companions shows only when the character has companion features or companions ([companions.md](companions.md)). Notes shows only for the owner's own campaign copy, not for the DM and not in preview (`showNotesTab`). On phones, swiping steps through tabs and scrolling down tucks the header away.

| Area | What it does | Backend call |
|---|---|---|
| HP | Damage and healing by amount, clamped to `[0, max_hp]`; heroic inspiration toggle | `PUT /characters/:id` (saves the sheet) |
| Rests | Short rest dialog (Hit Dice spent, HP healed) and long rest dialog; restores spellcasting and tracked resources | `POST /characters/:id/life-rest`, `/spell-rest`, `/rest` |
| Actions tab | Weapon and spell attacks, tracked class-feature resources grouped by action economy (bonus actions, special, reactions, actions), weapon mastery reference, special-action choices such as maneuvers, and fixed PHB action/reaction reference lists | `PUT /characters/:id` when a use is spent |
| Inventory | Equip, attune, repair, use, transfer and remove item instances (`MagicInventoryComponent`); currency with automatic change-making; DM (or owner of a personal character) can grant and revoke items, including a freshly created custom item | `POST /characters/:id/inventory/:instanceId`, `/grant-item`, `/revoke-item`, `/inventory-options` |
| Spells | Spells by origin with filters; cast with slot, pact, free or cantrip method; concentration replacement confirmation and end concentration; DM can grant and revoke spells | `POST /characters/:id/cast`, `PATCH .../concentration`, `/grant-spell`, `/revoke-spell` |
| Portrait and name | Avatar creator dialog (generated portrait, uploaded image, token border) and rename; allowed even on a locked copy | `POST /characters/portrait`, `PUT /characters/:id` |
| Export | Obsidian Fantasy Statblocks export of the sheet (`StatblockExportMenuComponent`, `characterStatblock`) | none (client-side) |
| Level-up | A banner/link to `/home/characters/:id/level-up` when a level is pending (copies only, hidden for the DM) | see [character-wizard.md](character-wizard.md#level-up-mode) |

Level-up pending is `levelUpPending(char, suggestedMaxHp)` in `core/utils/level-up.ts`: `applied_level < level`; for older characters without `applied_level`, a stored max HP that does not match the average for the current level counts as one pending level.

**Preview mode.** With `preview=true` (set by the wizard) the sheet is look-only: clicks that would change or save are swallowed (`onPreviewClick`); only navigation (tabs, expanders, filters) works. Race, class and background edits reload content in place.

**Limitations.** Saving is the whole character through the interactive paths named above; there is no offline queue. A campaign copy's spells cannot be changed during an active encounter (`409`).

Sources: `dnd_vtt_frontend/src/app/features/characters/character-play-sheet/character-play-sheet.ts` (`showNotesTab`, `hasCompanions`, `applyHpDelta`, `rest`, `confirmShortRest`, `useAction`, `grantItem`, `revokeItem`, `grantSpell`, `revokeSpell`, `requestCast`, `endConcentration`, `changePortrait`, `confirmNameEdit`, `onPreviewClick`), `dnd_vtt_frontend/src/app/core/utils/level-up.ts`, `dnd_vtt_frontend/src/app/core/services/character.service.ts`, `dnd_vtt_frontend/src/app/core/services/character-stats.service.ts`, `dnd_vtt_frontend/src/app/shared/components/magic-inventory/`, `dnd_vtt_backend/src/characters/` (`characters.controller.ts`, `inventory.service.ts`, `character-rest.service.ts`).

## Character notes

**What the user sees.** The Notes tab of the sheet is a private markdown notebook: the same live-preview editor as the wiki, a lock icon ("Only you can see these notes"), a save indicator, and a button that opens the page in the campaign wiki. Autosave runs 1.5 s after the last edit (`AUTOSAVE_MS`) and on blur, tab close (`beforeunload`) and destroy. If the page changed elsewhere, a conflict banner offers Reload.

**Flow.** `CharacterNotesComponent` calls `WikiService.characterNotes(characterId)` → `GET /api/wiki/character/:characterId`, which returns `{ campaignId, slug }` of a wiki page the server creates for each campaign character; then it loads the page and the wiki tree for `[[` link completion. Saving uses the wiki page update with the stored `updated_at` as `expectedUpdatedAt`, so a concurrent change yields `409`. Page visibility, deletion with the character and the owner-only rule are in [api/wiki.md](../api/wiki.md) and [wiki.md](wiki.md).

**Limitations.** Only characters in a campaign have notes (`404` otherwise); a personal character has no notes tab.

Sources: `dnd_vtt_frontend/src/app/features/characters/character-notes/character-notes.ts` (`load`, `onChange`, `flush`), `dnd_vtt_frontend/src/app/core/services/wiki.service.ts` (`characterNotes`), `dnd_vtt_backend/src/wiki/wiki.service.ts` (`characterNotes`).
