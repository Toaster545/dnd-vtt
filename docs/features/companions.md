# Feature: companions — Beast Master Primal Companions and Battle Smith Steel Defenders on the sheet and in combat.

Last updated: 2026-10-28 (commit 00cb49a)

**What it does.** A character with the right subclass can have one companion creature per kind, tracked with its own HP, conditions and per-encounter turn state. Availability (`companionOptions` in `companion-rules.ts`):

| Kind | Name | Requires | Forms |
|---|---|---|---|
| `primal` | Primal Companion (source `XPHB`) | Ranger, Beast Master subclass, class level 3 or more | `land`, `sea`, `sky` |
| `steel` | Steel Defender (source `EFA`) | Artificer, Battle Smith subclass, class level 3 or more | `defender` |

**Where the user sees it.**

- **Play sheet.** The Companions tab appears when the character has saved companions, companion features or active companions ([characters.md](characters.md#play-sheet)). It embeds `CompanionSheetComponent` (`shared/components/companion-sheet/`, inputs `characterId`, `selectedId`, `readonly`; output `changed`) to manage the companions. The backend supports these actions (UI coverage of each is not verified here): `rename`, `portrait`, `hp`, `correct_hp`, `temp_hp`, `conditions`, `dismiss`, `replace`, `revive`, `command`, `use`, `correct_turn`, `restore_resource`, `short_rest`, `jolt`. After a change the sheet refetches the character.
- **DM encounter page.** The DM opens the same component for a companion token and can "arm" a companion in the roster to place its token ([sessions-and-encounters.md](sessions-and-encounters.md#dm-encounter-play)). Companions of every party character are watched live.
- **Map.** Companion tokens carry `companion_id` and are decorated server-side; the owner (or the DM) may recolour the token ([battle-map.md](battle-map.md), [api/maps.md](../api/maps.md#tokens)).

**Flow.**
1. `CompanionService.get/create/update` call `/api/characters/:characterId/companions` ([api/companions.md](../api/companions.md)). All changes go through one `POST .../:id` with an `action` and the companion's `revision`; a stale revision answers `409`.
2. `CompanionsService` stores each companion in `companions` and its per-encounter turn state in `companion_turns` ([data-model.md](../data-model.md#characters)).
3. After a change, `CompanionsGateway.changed` emits `companions_updated` (and `character_updated` when the owner's resources changed) to the campaign room ([architecture/realtime.md](../architecture/realtime.md#companionsgateway-srccompanionscompanionsgatewayts)). `CompanionService.watch(id)` refetches on `companions_updated`, `character_updated`, `turn_changed` and reconnect.

**Limitations.** One companion per `kind` per character (`409` otherwise). The kinds and forms are fixed in code, not in the content JSON.

Sources: `dnd_vtt_backend/src/companions/companion-rules.ts` (`companionLevel`, `companionOptions`), `dnd_vtt_backend/src/companions/companions.service.ts`, `dnd_vtt_backend/src/companions/companions.gateway.ts`, `dnd_vtt_frontend/src/app/core/services/companion.service.ts` (`watch`), `dnd_vtt_frontend/src/app/shared/components/companion-sheet/companion-sheet.ts`, `dnd_vtt_frontend/src/app/features/characters/character-play-sheet/character-play-sheet.ts` (`hasCompanions`, `companionChanged`), `dnd_vtt_frontend/src/app/features/dm/dm-campaigns/dm-encounter-play/dm-encounter-play.ts` (`armCompanion`).
