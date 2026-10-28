# API: the single player bootstrap route under `/api/player`.

Last updated: 2026-10-28 (commit 00cb49a)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/player/bootstrap` | JWT | Query `campaignId?`, `characterId?` | `{ profile, characters, campaigns, selected_character_id, selected_campaign_id, current_context, server_time }` |

Behaviour of `PlayerService.bootstrap`:

- `profile`: the caller's profile row. `characters`: all of the caller's characters (any campaign), newest-updated first, as summaries (`id`, `campaign_id`, `name`, `race`, `class`, `level`, `current_hp`, `max_hp`, `temp_hp`, `armor_class`, `conditions`, `portrait_seed`, `creation_status`, `draft_step`, `updated_at`). `campaigns`: summaries of `CampaignsService.findAllForUser` (`id`, `name`, `description`, `background_url`, `is_owner`, `current_session_id`, `updated_at`).
- Selection: the requested campaign if it is in the caller's list, else the first campaign, else `null`. The selected character is the requested one if owned, else the caller's character in the selected campaign, else the first character, else `null`.
- `current_context`: `CampaignsService.getCurrentContext` for the selected campaign (see [campaigns.md](campaigns.md)), or `null` when there is no campaign.

Sources: `dnd_vtt_backend/src/player/player.controller.ts`, `dnd_vtt_backend/src/player/player.service.ts` (`bootstrap`).
