# Feature: content library — browsing official game content and authoring personal homebrew monsters, items and spells.

Last updated: 2026-10-28 (commit 00cb49a)

**What the user sees.** `/home/content-library` (tab "Content Library", `CreateContentComponent` in `features/create-content/`) is a personal library owned by the signed-in user and reusable across every campaign they run; it is not scoped to one campaign. A side menu switches between seven sections (`CreateSection`): Species, Classes, Backgrounds, Feats, Monsters, Equipment (the code spells it `equipement`) and Spells.

| Section | Component | Official content | Homebrew |
|---|---|---|---|
| Species, Classes, Backgrounds, Feats | `PlayerOptionLibraryComponent` (`kind` input) with `PlayerOptionDetailDialogComponent` | Search, source filter, sort by name or source, detail dialog | None: the component only browses |
| Monsters | `DmMonstersComponent` + `MonsterFormComponent` | Static set shown read-only in a collapsible "official" list | Create, edit, duplicate, delete; statblock export menu; token art falls back to an icon when no art exists |
| Equipment | `DmItemsComponent` + `ItemFormComponent` | Static set; the user can override an official item's image with an icon from the library | Create, edit, duplicate, delete; image upload; JSON import; print cards |
| Spells | `DmSpellsComponent` + `SpellFormComponent` | Static set | Create, edit, duplicate, delete |

Shared pieces: `ContentSourceFilterComponent` (filter by rulebook source), `ContentDetailDialogComponent`, and `EntryListComponent` inside the monster form.

## Flow

1. **Loading.** Each library loads its own entries (`MonsterService.getMine` → `GET /api/content/monsters/mine`, and the items and spells equivalents) in parallel with the static set (`ContentService.getMonsters()` etc. → `GET /api/content/monsters`) and `getSources()` (`GET /api/content/sources`). Endpoints and request shapes: [api/content.md](../api/content.md).
2. **Save.** Create and update call `POST` and `PUT /api/content/{monsters,items,spells}`; custom entries get the index `custom:<uuid>`. Only the creator can update or delete. Homebrew is stored in the `custom_monsters`, `custom_items` and `custom_spells` tables ([data-model.md](../data-model.md#homebrew-content)).
3. **Items.** Item images: upload for a custom item (`POST /api/content/items/:index/image`), or choose an icon (`GET /api/content/icons`) as a per-user override for an official item (`PUT` and `DELETE /api/content/items/:index/image-override`). JSON import accepts a bare array or `{ "items": [...] }` and sends it to `POST /api/content/items/bulk`; unknown fields are dropped by the DTO whitelist. Print mode selects items and opens `ItemCardPrintComponent`, a 3×3 sheet of poker-size cards (2.5 × 3.5 in) with crop marks.
4. **Use in play.** Homebrew appears to players and DMs through the merged lists `GET /api/content/monsters|items|spells?campaignId=`, which add the campaign DM's custom entries to the static set ([architecture/content.md](../architecture/content.md#homebrew-custom-content)). Encounter monster pickers and the item/spell grants on the sheet use those lists ([sessions-and-encounters.md](sessions-and-encounters.md#encounter-form), [characters.md](characters.md#play-sheet)). Campaigns restrict official content by `allowed_sources` ([campaigns.md](campaigns.md)).

## Limitations

- Species, classes, backgrounds and feats cannot be authored here; their content comes from the JSON files under `dnd_vtt_backend/content/` ([architecture/content.md](../architecture/content.md)).
- The monster token-art download is a separate script, so homebrew monsters usually show the fallback icon (see the scripts list in [overview.md](../overview.md)).
- The print layout is fixed (Letter, 3×3); the constants in `item-card-print.ts` must stay in sync with its stylesheet.

Sources: `dnd_vtt_frontend/src/app/features/create-content/create-content.ts` (`CreateSection`), `dnd_vtt_frontend/src/app/features/create-content/create-content.html`, `dnd_vtt_frontend/src/app/features/create-content/monsters/dm-monsters.ts` (`load`, `statblockFor`), `dnd_vtt_frontend/src/app/features/create-content/items/dm-items.ts` (`onImagePicked`, `onImageReset`, `onImportFileSelected`, `togglePrintMode`), `dnd_vtt_frontend/src/app/features/create-content/items/item-card-print/item-card-print.ts`, `dnd_vtt_frontend/src/app/features/create-content/spells/dm-spells.ts`, `dnd_vtt_frontend/src/app/features/create-content/player-options/player-option-library.ts`, `dnd_vtt_frontend/src/app/core/services/monster.service.ts`, `dnd_vtt_frontend/src/app/core/services/item.service.ts`, `dnd_vtt_frontend/src/app/core/services/spell.service.ts`, `dnd_vtt_backend/src/content/content.service.ts` (`getMerged`, `listMine`, `createCustom`, `setItemImageOverride`).
