# API: character CRUD, drafts, inventory, spells, rests and level-up under `/api/characters`.

Last updated: 2026-10-28 (commit 00cb49a)

`CharactersController` has `@UseGuards(JwtGuard)` only. Table and blob shape: [data-model.md](../data-model.md#characters). Conventions: [README.md](README.md#conventions).

## Access rules

- **Owner**: `characters.user_id === caller`. **Campaign DM**: the caller owns the campaign in `characters.campaign_id`. A character with `campaign_id` set is a *campaign copy*.
- **Read** (`findOneReadable`): owner, or the DM of the copy's campaign. Anyone else gets `403`.
- **Write** (`PUT /characters/:id`): a personal character is writable by its owner. A campaign copy is writable in full only by its DM, or by the owner after the DM set `campaign_members.edit_unlocked` ([campaigns.md](campaigns.md)). Otherwise the owner may only change the fields in `PLAYER_EDITABLE_FIELDS` (HP, resource and spell-slot usage, concentration, inspiration, `equipment`, `spells`, `currency`, portrait and token-border fields, ...); the rest of the body is ignored. Changing `spells` or `spell_choices` of a campaign copy during an active encounter gives `409`.
- **Inventory and spell grants** are DM-managed for a campaign copy; for a personal character (no DM) the owner manages it (`InventoryService.canManage`). `grant-spell` and `revoke-spell` require the campaign DM (`403` otherwise).

## Routes

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/characters` | JWT | none | The caller's personal characters (`campaign_id IS NULL`), newest first |
| GET | `/characters/copies` | JWT | none | The caller's campaign copies, with `campaign_name` and `edit_unlocked` |
| GET | `/characters/:id` | JWT (owner or DM) | none | The character: columns merged with the `data` blob |
| POST | `/characters/portrait` | JWT | multipart `file` (PNG, JPEG or WebP, max 2 MiB) | `{ url }` under `uploads/portraits/<userId>/` |
| POST | `/characters` | JWT | Character body | Creates a complete personal character |
| POST | `/characters/drafts` | JWT | Character body | Creates a character with `creation_status = 'draft'` |
| PATCH | `/characters/:id/draft` | JWT (owner) | Character body incl. `draft_step` (clamped to 0–6) | Saves a draft; `403` for campaign copies |
| POST | `/characters/:id/complete` | JWT (owner) | none | Marks a draft `complete`; `400` if invalid, `403` for campaign copies |
| PUT | `/characters/:id` | JWT | Character body | Replaces the `data` blob (see write rules above); `name`, `race`, `class`, `level` go to their columns |
| DELETE | `/characters/:id` | JWT (owner) | none | `{ deleted: true }` |
| POST | `/characters/:id/level-up` | JWT (owner of a campaign copy) | Character body (only `LEVEL_UP_EDITABLE_FIELDS` are applied) | Applies a DM-granted level-up; `400` for non-campaign characters, `409` if no level-up is pending |
| GET | `/characters/:id/inventory-options` | JWT | none | Options for inventory operations |
| POST | `/characters/:id/inventory/:instanceId` | JWT | `{ action, equipped?, baseItemIndex?, amount?, replaceConcentration?, event?, targetId? }`; `action` is one of `equip`, `attune`, `unattune`, `repair`, `use`, `recover`, `transfer`, `remove` | Applies the action to one item instance |
| POST | `/characters/:id/grant-item` | JWT (DM; owner if personal) | `{ itemIndex, quantity? (≥ 1) }` | Adds items; returns the character |
| POST | `/characters/:id/revoke-item` | JWT (DM; owner if personal) | `{ itemIndex, quantity? }` (omitted removes the stack) | Removes items |
| POST | `/characters/:id/rest` | JWT | `{ requestId (≤ 100 chars), correction?, toolsConfirmed?, creations?: [{ planId, baseItemIndex?, itemIndex?, attune? }] }` | Long-rest wrap-up for magic items (replicas, charges). `requestId` makes retries idempotent; `correction` is DM-only |
| POST | `/characters/:id/replicate-item` | JWT | none | Deprecated stub: always `409 'Replication now happens during Long Rest. Refresh the character sheet.'`. Replication now happens in `POST /characters/:id/rest` (`creations`) |
| POST | `/characters/:id/pact-weapon` | JWT | `{ action: 'conjure' \| 'bond' \| 'dismiss', itemIndex?, instanceId? }` | Warlock pact weapon; `itemIndex` required for conjure and bond |
| POST | `/characters/:id/grant-spell` | JWT (DM) | `{ spellIndex, sourceName? }` | Adds a granted spell; `403 'Only the campaign DM can grant spells.'` |
| POST | `/characters/:id/revoke-spell` | JWT (DM) | `{ spellIndex }` | Removes a granted spell |
| POST | `/characters/:id/cast` | JWT | `{ spellIndex, sourceKey, method: 'cantrip' \| 'slot' \| 'pact' \| 'restricted' \| 'free', poolKey?, slotLevel?, freeCastKey?, maxUses?, recovery?, atWill?, replaceConcentration? }` | Spends a slot or free cast and updates concentration |
| POST | `/characters/:id/spell-rest` | JWT | `{ type: 'short_rest' \| 'long_rest' }` | Restores spellcasting resources |
| POST | `/characters/:id/life-rest` | JWT | `{ type, hitDiceUsed? (≥ 0), healed? (≥ 0) }` (Hit Dice fields apply to a short rest only) | Restores HP and resources; `400` for invalid dice or healing |
| PATCH | `/characters/:id/concentration` | JWT | none | Ends the active concentration |

Route order matters: `copies`, `portrait` and `drafts` are declared before the `:id` routes.

## Character body

`POST /characters`, `POST /characters/drafts`, `PATCH /characters/:id/draft`, `PUT /characters/:id` and `POST /characters/:id/level-up` use `ValidateOnlyPipe(CharacterBodyDto)`: only these typed fields are validated, all other keys are accepted unchanged as part of the `data` blob.

| Field | Rule |
|---|---|
| `name`, `race`, `class` | string |
| `level` | integer 1–20 |
| `draft_step` | integer |
| `current_hp`, `max_hp` | number |
| `equipment`, `classes`, `spells` | array |
| `currency`, `resource_uses` | object |
| `heroic_inspiration` | boolean |

Companion routes for a character are in [companions.md](companions.md). Writing the data blob of a campaign copy emits `character_updated` to the campaign room (`CharacterRepository.notifyUpdated`); events are listed in [architecture/realtime.md](../architecture/realtime.md).

Sources: `dnd_vtt_backend/src/characters/characters.controller.ts`, `dnd_vtt_backend/src/characters/characters.service.ts` (`updateUnlocked`, `PLAYER_EDITABLE_FIELDS`, `LEVEL_UP_EDITABLE_FIELDS`, `applyLevelUp`, `updateDraft`, `completeDraft`, `grantSpell`, `revokeSpell`, `uploadPortrait`, `replicateItem`), `dnd_vtt_backend/src/characters/character-repository.ts` (`findOneReadable`), `dnd_vtt_backend/src/characters/inventory.service.ts` (`canManage`, `grant`, `rest`), `dnd_vtt_backend/src/characters/dto/`, `dnd_vtt_backend/src/common/validate-only.pipe.ts`.
