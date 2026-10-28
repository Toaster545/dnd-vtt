# API: campaign CRUD, joining, membership management and the current-session context under `/api/campaigns`.

Last updated: 2026-10-28 (commit 00cb49a)

`CampaignsController` has `@UseGuards(JwtGuard)` only. There is no `AdminGuard`: any authenticated user can create a campaign (becoming its DM, `campaigns.dm_id`) or join one. "DM" below means `campaign.dm_id === caller`, checked in `CampaignsService`; "member" means an active `campaign_members` row. Tables: [data-model.md](../data-model.md#campaigns). Conventions: [README.md](README.md#conventions).

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/campaigns` | JWT | none | Campaigns the caller owns plus those they are an active member of (`findAllForUser`), ordered using `campaign_visits` |
| POST | `/campaigns` | JWT | `{ name, description?, allowed_sources?: string[] }` | The new campaign; caller becomes DM |
| POST | `/campaigns/join` | JWT | `{ joinCode, characterId }` | Joins with a copy of the caller's personal character. Code is trimmed and upper-cased. `404` unknown code; `403` if the character is not the caller's or is already a campaign copy; `400` if the character does not satisfy the campaign's `allowed_sources`. The copy starts at the party's level and hidden from the party list (`visible_to_party = 0`). Returns the campaign (as `GET /campaigns/:id`) |
| GET | `/campaigns/join-preview/:joinCode` | JWT | none | `{ campaign_id, campaign_name, allowed_sources, characters: [{ character_id, ...compatibility }] }` for the caller's personal characters; `404` unknown code |
| GET | `/campaigns/:id` | JWT | none | DM or member. Campaign row (blob fields flattened, e.g. `allowed_sources`) plus `sessions` (all for the DM; only `visible_to_players = 1` for members) and `members` (all for the DM; members see those with `visible_to_party` and their own row). Records a `campaign_visits` entry |
| GET | `/campaigns/:id/current-context` | JWT | none | DM or member. `{ campaign_id, current_session, current_encounter, current_map, updated_at }`; the session/encounter/map are `null` when none is set or, for members, not visible |
| PATCH | `/campaigns/:id/current-session` | JWT (DM) | `{ session_id: string \| null }` | Sets or clears `current_session_id`; `400` if the session belongs to another campaign. Returns the current context |
| PATCH | `/campaigns/:id` | JWT (DM) | `{ description?, background_url?, allowed_sources? }` | Updates the given fields; returns the campaign |
| POST | `/campaigns/:id/background` | JWT (DM) | multipart `file` | Stores the image under `uploads/campaigns/<id>/`, sets `background_url`, returns the campaign |
| DELETE | `/campaigns/:id` | JWT (DM) | none | `{ deleted: true }`; cascades per the schema |
| GET | `/campaigns/:id/members` | JWT (DM) | none | Every membership row including `status = 'removed'`, with `username` and `character_name` |
| PATCH | `/campaigns/:id/party-level` | JWT (DM) | `{ level: 1–20 }` | Sets `level` of every active member's character copy and pins `applied_level` so a level-up shows as pending; HP and features are not recomputed |
| DELETE | `/campaigns/:id/members/me` | JWT (member) | none | Leaves the campaign; `400` if the caller is the DM. Returns `{ left: true, characterId }` |
| DELETE | `/campaigns/:id/members/:userId` | JWT (DM) | none | Removes the member: membership `status = 'removed'` and the character copy is detached (`campaign_id = NULL`), becoming a normal editable character. Returns `{ removed: true }` |
| PATCH | `/campaigns/:id/members/:userId/edit-access` | JWT (DM) | `{ unlocked: boolean }` | Sets `edit_unlocked` (full edit of the copy, see [characters.md](characters.md#access-rules)) |
| PATCH | `/campaigns/:id/members/:userId/party-visibility` | JWT (DM) | `{ visible: boolean }` | Sets `visible_to_party`; returns `{ visible_to_party }` |
| PATCH | `/campaigns/:id/members/me/race-class-visibility` | JWT (member) | `{ visible: boolean }` | Sets the caller's own `show_race_class`; `404` if no active membership |

Route order matters: `join`, `join-preview/:joinCode` and the `members/me` routes are declared before their `:id`/`:userId` siblings.

Sources: `dnd_vtt_backend/src/campaigns/campaigns.controller.ts`, `dnd_vtt_backend/src/campaigns/campaigns.service.ts` (`findAllForUser`, `findOne`, `getCurrentContext`, `setCurrentSession`, `update`, `join`, `previewJoin`, `getMembers`, `setPartyLevel`, `detachMember`, `leave`, `removeMember`), `dnd_vtt_backend/src/campaigns/dto/`.
