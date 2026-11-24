# API: static game content reads and DM-authored homebrew (monsters, items, spells) under `/api/content`.

Last updated: 2026-10-28 (commit 00cb49a)

How content is stored, loaded, merged and cached is in [architecture/content.md](../architecture/content.md); this file lists the routes. `ContentController` has class-level `@UseGuards(JwtGuard)`; routes marked **Public** carry `@Public()` and need no token. Custom entries (index `custom:<id>`, tables `custom_monsters`, `custom_items`, `custom_spells`, see [data-model.md](../data-model.md#homebrew-content)) belong to the user who created them: update, delete and image routes return `403` for anyone else (checked in `ContentService`, not by `AdminGuard`). Conventions: [README.md](README.md#conventions).

## Static reads

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/content/sources` | Public | Content source (rulebook) list |
| GET | `/content/icons` | Public | Icon library manifest, plus item-art entries |
| GET | `/content/classes`, `/content/classes/:index` | Public | Class list / one class |
| GET | `/content/races`, `/content/races/:index` | Public | Race list / one race |
| GET | `/content/backgrounds`, `/content/backgrounds/:index` | Public | Character background list / one background (not the app backgrounds in [backgrounds.md](backgrounds.md)) |
| GET | `/content/feats`, `/content/feats/:index` | Public | Feat list / one feat |
| GET | `/content/spell-lists` | Public | Spell lists built from the classes |

## Monsters, items, spells

The three kinds share the same route pattern. List routes merge the static set with the library of the DM of `campaignId` (query, optional) and need a token; single-entry reads are public and return a static or custom entry.

| Method | Path | Auth | Request | Response / rules |
|---|---|---|---|---|
| GET | `/content/monsters` · `/content/items` · `/content/spells` | JWT | Query `campaignId?` | Static entries merged with the campaign DM's custom entries. Spells carry derived access metadata |
| GET | `/content/monsters/mine` · `/content/items/mine` · `/content/spells/mine` | JWT | none | The caller's own custom entries, by name |
| GET | `/content/monsters/:index` · `/content/items/:index` · `/content/spells/:index` | Public | none | One entry |
| POST | `/content/monsters` | JWT | `CreateMonsterDto` | Creates a custom monster; returns it with `index = 'custom:<uuid>'` |
| PUT | `/content/monsters/:index` | JWT (creator) | `CreateMonsterDto` | Replaces the custom monster |
| DELETE | `/content/monsters/:index` | JWT (creator) | none | `{ deleted: true }` |
| POST | `/content/items` | JWT | `CreateItemDto` | Creates a custom item |
| POST | `/content/items/bulk` | JWT | `{ items: CreateItemDto[] }` (at least one) | Creates several items, each validated like a single create |
| PUT | `/content/items/:index` | JWT (creator) | `CreateItemDto` | Replaces the item |
| DELETE | `/content/items/:index` | JWT (creator) | none | `{ deleted: true }` |
| POST | `/content/items/:index/image` | JWT (creator) | multipart `file` (must have an `image/*` type) | Stores under `uploads/items/<id>/` and sets `image_url` on the custom item |
| PUT | `/content/items/:index/image-override` | JWT | `SetItemImageOverrideDto` (`image_url`) | Sets the caller's image override for an official item (table `item_image_overrides`); `400` for a `custom:` item |
| DELETE | `/content/items/:index/image-override` | JWT | none | Clears the caller's override |
| POST | `/content/spells` | JWT | `CreateSpellDto` | Creates a custom spell; missing `mechanics` and `source` fields are filled with defaults (`source.book = 'Homebrew'`) |
| PUT | `/content/spells/:index` | JWT (creator) | `CreateSpellDto` | Replaces the spell, same defaults |
| DELETE | `/content/spells/:index` | JWT (creator) | none | `{ deleted: true }` |

Route order matters: `mine` is declared before `:index`.

## Request shapes (key fields)

| DTO | Required fields | Notable optional fields |
|---|---|---|
| `CreateMonsterDto` | `name`, `size`, `type`, `alignment`, `armor_class`, `hit_points`, `hit_dice`, `speed` (`walk`, `fly`, `swim`, `climb`, `burrow`), `ability_scores` (six abilities, ints ≥ 1), `senses` (`passive_perception` required), `languages`, `challenge_rating`, `xp`, `actions` (`[{ name, description }]`) | `color` (`#rrggbb`), `armor_class_desc`, `saving_throws`, `skills`, damage and condition lists, `traits`, `bonus_actions`, `reactions`, `legendary_actions`, `description` |
| `CreateItemDto` | `name`, `type`, `category`, `properties`, `weight`, `cost`, `description` | `damage`, `damage_type`, `armor_class`, `mastery` (`property`, `description`), `rarity`, `requires_attunement`, `enhancement_bonus`, `charges` (`max`, `recovery`), `actions` (`key`, `name`, `activation`: `action`, `bonus_action`, `reaction` or `free`), `image_url` |
| `CreateSpellDto` | `name`, `level` (0–9), `school`, `casting_time`, `range`, `components` | `material`, `material_cost_cp`, `mechanics`, `source`, plus the remaining fields in the DTO file |

Sources: `dnd_vtt_backend/src/content/content.controller.ts` (`withSpellDefaults`, `DEFAULT_SPELL_SOURCE`), `dnd_vtt_backend/src/content/content.service.ts` (`getMerged`, `listMine`, `createCustom`, `createCustomBulk`, `updateCustom`, `deleteCustom`, `uploadItemImage`, `setItemImageOverride`, `clearItemImageOverride`), `dnd_vtt_backend/src/content/dto/`.
