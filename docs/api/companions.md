# API: companion routes (summoned or bonded creatures) under `/api/characters/:characterId/companions`.

Last updated: 2026-10-28 (commit 00cb49a)

`CompanionsController` has `@UseGuards(JwtGuard)`. Every route resolves the owning character with `CompanionsService.owner`: `404` if the character does not exist, `403` unless the caller owns it or is the DM of its campaign. Table: [data-model.md](../data-model.md#characters) (`companions`, `companion_turns`). Conventions: [README.md](README.md#conventions). Companion changes are announced with the `companions_updated` event ([architecture/realtime.md](../architecture/realtime.md)).

All three routes return the service result plus `slots`: the owner's spell-slot pools (excluding `restricted` pools) flattened to `[{ poolKey, level, name, remaining }]`.

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/characters/:characterId/companions` | JWT (owner or DM) | none | Companions of the character with their state and available options, plus `slots` |
| POST | `/characters/:characterId/companions` | JWT (owner or DM) | `{ kind, form, name? }` | Creates a companion. `400` if the kind/form is not available to the character; `409` if the character already has one of that `kind` ("Manage or replace your existing companion") |
| POST | `/characters/:characterId/companions/:id` | JWT (owner or DM) | `{ action, revision, ...action fields }` | One endpoint for all changes (not PATCH). `revision` must equal the stored revision, else `409`. `404` unknown companion |

`action` values handled by `CompanionsService.update`: `rename`, `portrait`, `hp`, `correct_hp`, `temp_hp`, `conditions`, `dismiss`, `replace`, `revive`, `command`, `use`, `correct_turn`, `restore_resource`, `short_rest`, `jolt`. The optional DTO fields are `name`, `portrait_image`, `amount`, `conditions`, `form`, `slotLevel`, `poolKey`, `command`, `cost`, `key`, `bonus`, `target`, `field`, `hitDice`; which of them an action reads is decided and validated inside the service (not mapped per action here). An unknown action gives `400`.

Sources: `dnd_vtt_backend/src/companions/companions.controller.ts` (`withSlots`), `dnd_vtt_backend/src/companions/companions.service.ts` (`owner`, `list`, `create`, `update`), `dnd_vtt_backend/src/companions/dto/companion.dto.ts`.
