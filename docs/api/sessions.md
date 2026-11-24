# API: session CRUD, background upload and visibility under `/api/sessions`.

Last updated: 2026-10-28 (commit 00cb49a)

`SessionsController` has `@UseGuards(JwtGuard)` only. Ownership is `session.dm_id` / `campaign.dm_id`, checked in `SessionsService`. Table: [data-model.md](../data-model.md#sessions-and-encounters). Conventions: [README.md](README.md#conventions).

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/sessions` | JWT | Query `campaignId` | Sessions of the campaign, newest first. The DM gets all; an active member gets only `visible_to_players = 1`; `404` unknown campaign, `403` otherwise |
| POST | `/sessions` | JWT (campaign DM) | `{ name, campaign_id, description? }` | The new session; `403` if the caller is not the campaign's DM |
| GET | `/sessions/:id` | JWT | none | Session row. Non-owners must be active members and the session must be visible, else `403` |
| PATCH | `/sessions/:id` | JWT (DM) | `{ description?, background_url? }` | Updated session |
| POST | `/sessions/:id/background` | JWT (DM) | multipart `file` | Stores under `uploads/sessions/<id>/` and sets `background_url` |
| PATCH | `/sessions/:id/visibility` | JWT (DM) | `{ visible: boolean }` | Sets `visible_to_players` |
| DELETE | `/sessions/:id` | JWT (DM) | none | Deletes the session |

Sources: `dnd_vtt_backend/src/sessions/sessions.controller.ts`, `dnd_vtt_backend/src/sessions/sessions.service.ts` (`findAllForCampaign`, `findOneForUser`, `create`, `update`, `uploadBackground`, `setVisibility`, `remove`), `dnd_vtt_backend/src/sessions/dto/`, `dnd_vtt_backend/src/common/set-visible.dto.ts`.
