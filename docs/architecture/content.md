# Content module architecture: how static D&D game content and DM-authored homebrew are loaded, merged and served.

Last updated: 2026-10-28 (commit 00cb49a)

`ContentModule` (`src/content/`) serves SRD-derived game data from JSON files and merges it with homebrew stored in SQLite. The frontend gets all game data from these endpoints; there is no external SRD API. The module imports `AuthModule` and exports `ContentService`, which `CharactersModule` and `MapsModule` also import.

## Content files

Read from `dnd_vtt_backend/content/` (`CONTENT_PATH` = `<cwd>/content`). Bulk JSON is not reproduced here; this is its layout.

| Folder | Content | Files at 00cb49a |
|---|---|---|
| `classes/` | One JSON per class (may embed `subclasses`) | 13 |
| `subclasses/` | Subclasses as separate files, each with `class_index` | 45 |
| `races/` | Species | 15 |
| `backgrounds/` | Backgrounds | 33 |
| `feats/` | Feats | 125 |
| `items/` | Items | 351 |
| `spells/` | Spells | 490 |
| `monsters/` | Monsters | 385 |
| `manifests/` | Per-book manifests; `spell_list_additions` maps class index to extra spell indices | 4 |
| `plans/magic-item-plans.json` | Magic-item grant plans | 1 |
| `icons/` | `manifest.json`, `ATTRIBUTION.md`, `svg/` (game-icons.net, CC BY 3.0) | n/a |

Key casing convention (from `CLAUDE.md`, root): original SRD-style fields are `snake_case`, the `TraitGrant` / effect vocabulary is `camelCase`; schema tests are in `content-schema.spec.ts`.

Sources: `dnd_vtt_backend/content/` (directory listing), `dnd_vtt_backend/src/content/content.service.ts` (`CONTENT_PATH`), `dnd_vtt_backend/src/content/content-schema.spec.ts`.

## Loading and caching

`ContentService` keeps a per-process `Map` cache and never invalidates it; editing a JSON file requires a restart.

- `loadAll(type)` reads every `*.json` in `content/<type>/`, applies `withSource`, caches under `all:<type>`.
- `loadOne(type, index)` reads `content/<type>/<index>.json`, cached per `<type>:<index>`; a missing file becomes a `NotFoundException`.
- `withSource` ensures each record has a `source` object with a `code`: if the file has none, the fallback is `XMM` for `monsters` and `XPHB` for everything else. Embedded `subclasses` get the same treatment.
- `getClasses()` is derived and cached as `derived:classes`: each class gets its embedded subclasses plus the matching `subclasses/` files (minus `class_index`), and its `spellcasting.spells` list is merged with the `spell_list_additions` from every manifest (deduplicated, sorted).
- `getSpellLists()` derives class spell lists (`buildSpellLists`). `getSpellAccessRegistry()` (`derived:spell-access`) maps each spell to the classes, subclasses, species, backgrounds and feats that grant or list it (`buildSpellAccess` in `spell-access.ts`); spells returned by the API carry an `access` array.
- `getIconLibrary()` returns `icons/manifest.json` entries plus one entry per item that has downloaded art.
- Items get an `art_url` (`/uploads/item-art/<index>.webp`) when that file exists in `uploads/item-art/` (see [storage](storage.md#uploads)).

Sources: `dnd_vtt_backend/src/content/content.service.ts` (`loadAll`, `loadOne`, `withSource`, `getClasses`, `getSpellLists`, `getSpellAccessRegistry`, `getIconLibrary`), `dnd_vtt_backend/src/content/spell-access.ts`.

## Content sources (rulebooks)

`content-sources.ts` defines `CONTENT_SOURCES`, the list of source books (`ContentSourceDefinition`: `code`, `name`, `short_name`, `edition`, `description`, `default_enabled`, `locked`, `player_options`, `requires`). Codes defined as constants: `XPHB` (Player's Handbook 2024, always enabled and locked), `EFA` (Eberron: Forge of the Artificer), `XGE` (Xanathar's), `TCE` (Tasha's), `XMM` (Monster Manual), `HOMEBREW`. `GET /api/content/sources` returns the list. Enabled sources are stored in JSON `data` fields: `enabled_sources` on `characters` and `allowed_sources` on `campaigns` (backfilled by migration `v019`, default `["XPHB"]`). They are checked in the `characters` and `campaigns` services; those flows belong in the feature docs.

Sources: `dnd_vtt_backend/src/content/content-sources.ts`, `dnd_vtt_backend/src/common/migrations/v019.ts`, `dnd_vtt_backend/src/characters/character-repository.ts`, `dnd_vtt_backend/src/campaigns/campaigns.service.ts`.

## Homebrew (custom content)

Monsters, items and spells can be authored by users and are stored in the tables `custom_monsters`, `custom_items`, `custom_spells` (migration `v017`; `CUSTOM_TABLE` in the service), each row holding a JSON `data` column and a `created_by` user.

- One library per creating user. What a campaign sees is the static content plus the library of that campaign's `dm_id`, resolved by `resolveCampaignDmId`, which accepts the DM or an active member and otherwise throws `403 'Not a member of that campaign'`. Passing no `campaignId` returns static content only.
- Custom entries use an opaque index `custom:<uuid>`; single-item lookups dispatch on the `custom:` prefix.
- Operations: `listMine`, `createCustom`, `createCustomBulk` (items), `updateCustom`, `deleteCustom`, `uploadItemImage`, `setItemImageOverride`, `clearItemImageOverride` (per-DM image override for official items, migration `v025`).
- DTOs: `dto/create-monster.dto.ts`, `dto/create-item.dto.ts`, `dto/create-spell.dto.ts`, `dto/set-item-image-override.dto.ts`.

Sources: `dnd_vtt_backend/src/content/content.service.ts` (`getMerged`, `resolveCampaignDmId`, `CUSTOM_TABLE`, `createCustom`), `dnd_vtt_backend/src/content/dto/`, `dnd_vtt_backend/src/common/migrations/v017.ts`, `dnd_vtt_backend/src/common/migrations/v025.ts`.

## Endpoints and access

`ContentController` is `@Controller('content')` with class-level `@UseGuards(JwtGuard)`; the static reads below are opted out with `@Public()`. Full request/response detail belongs in the API docs.

| Access | Routes (under `/api/content`) |
|---|---|
| Public | `GET sources`, `icons`, `classes`, `classes/:index`, `races`, `races/:index`, `backgrounds`, `backgrounds/:index`, `feats`, `feats/:index`, `monsters/:index`, `items/:index`, `spell-lists`, `spells/:index` |
| JWT required | `GET monsters`, `items`, `spells` (accept `campaignId`), `GET monsters/mine`, `items/mine`, `spells/mine`; `POST`/`PUT`/`DELETE` on `monsters`, `items`, `spells`; `POST items/bulk`, `POST items/:index/image`, `PUT`/`DELETE items/:index/image-override` |

Ownership of custom entries is enforced in the service, not with `AdminGuard`.

Sources: `dnd_vtt_backend/src/content/content.controller.ts`.

## Tests

`src/content/*.spec.ts` validate the bulk content: `content-schema.spec.ts`, `content-sources.spec.ts`, `spell-access.spec.ts`, `magic-items.spec.ts`, `srd-monsters.spec.ts`, per-book specs (`efa-content`, `tce-content`, `xge-content`), `spell-content/spell-content.spec.ts` and per-class specs in `class-content/`.

Sources: `dnd_vtt_backend/src/content/`.
