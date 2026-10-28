# Frontend core: every service, model and util under `core/` with a one-line purpose.

Last updated: 2026-10-28 (commit 00cb49a)

All paths are relative to `dnd_vtt_frontend/src/app/core/`. Overall structure and routing: [frontend.md](frontend.md). Endpoint details live in [../api/README.md](../api/README.md); this file only says what each frontend unit is for. `API` in the services is `environment.apiUrl` (see [frontend.md](frontend.md#bootstrapping)). Every service is `@Injectable({ providedIn: 'root' })`.

## Services

`services/*.service.ts`. Unit tests sit beside them (`character-actions.service.spec.ts`, `character-stats.service.spec.ts`, `magic-equipment.spec.ts`).

### Auth services

| Service | Purpose |
|---|---|
| `AuthTokenService` | Holds the in-memory access token (`accessToken` signal); `acceptSession` stores a native client's refresh token in `@aparajita/capacitor-secure-storage` (key `dnd.refresh-session`); `refresh()` de-duplicates concurrent refresh calls (`refreshInFlight`); `isNative` from `Capacitor.isNativePlatform()`. Exports `SessionResponse` (`access_token`, optional `refresh_token`, `refresh_expires_at`, `client_type: 'web' \| 'native'`, `profile`). |
| `AuthService` | Current user: `profile` signal, `isAdmin` and `isLoggedIn` computeds, `ready` promise (restores the session through `AuthTokenService.refresh()` on start; guards await it), `signUp`, `signIn`, `signOut`. When `environment.devBypass` is true it sets the token `dev` and a stub admin profile, then loads the real profile from `/auth/me`. |
| `UserAdminService` | Admin-only account management calls (backend `UsersController`); used by the Settings dialog's admin section. |
| `ActivityService` | Last-activity timestamp in `localStorage` (`dnd-last-activity`); `touch()` and `isStale(ms)`; used by `staleSessionGuard`. |

Server side: [auth.md](auth.md), [../api/auth.md](../api/auth.md), [../api/users.md](../api/users.md).

### Domain data services

| Service | Purpose |
|---|---|
| `CampaignService` | Campaign CRUD, join preview/join/leave, members, edit-access and party-visibility flags, party level, current session context ([../api/campaigns.md](../api/campaigns.md)). |
| `SessionService` | Session CRUD, background upload, visibility toggle ([../api/sessions.md](../api/sessions.md)). |
| `EncounterService` | Encounter CRUD, start/stop, turns, per-player levels, and socket subscriptions such as encounter presence via `SocketService` ([../api/encounters.md](../api/encounters.md)). |
| `BattleMapService` | Maps, tokens, move confirm/undo, movement plans, fog and lighting ([../api/maps.md](../api/maps.md)). |
| `CharacterService` | Character CRUD, drafts, inventory, spell casting, rests, level-up. Exports `SpellCastCommand`, `SpellCastResponse`, `InventoryPlan`, `InventoryOptions` ([../api/characters.md](../api/characters.md)). |
| `CompanionService` | Companions of a character ([../api/companions.md](../api/companions.md)). |
| `WikiService` | Wiki pages, search, graph, uploads, character notes ([../api/wiki.md](../api/wiki.md)). |
| `PlayerContextService` | `state` signal holding `PlayerBootstrap` from `GET /player/bootstrap`; remembers the selected character and campaign in `localStorage` (`player.selected-character-id`, `player.selected-campaign-id`); `load`, `selectCharacter`, `selectCampaign`, `clearCampaign` ([../api/player.md](../api/player.md)). |
| `ContentService` | Static and custom game content under `/content/*` with an in-memory `Map` cache and `invalidateContent(kind, index?)`. Also defines the content types (`DndClass`, `DndRace`, `DndBackground`, `DndFeat`, `DndItem`, `DndSpell`, `DndMonster`, `TraitGrant`, `TraitEffect`, `StartingEquipment`, …) and `itemDisplayName` ([content.md](content.md), [../api/content.md](../api/content.md)). |
| `MonsterService`, `ItemService`, `SpellService` | Homebrew create/update/delete (and `getMine` for monsters) under `/content/…`; each invalidates the matching `ContentService` cache. |
| `SocketService` | The socket.io client (`autoConnect: false`, transports `websocket` then `polling`); `connect`, `disconnect`, `refreshAuthentication` (re-sends the current token and reconnects if connected); an `effect` re-authenticates whenever the access token changes ([realtime.md](realtime.md)). |

### Character-derived calculation services

| Service | Purpose |
|---|---|
| `CharacterStatsService` | Computes a character's `ComputedStats` (proficiency bonus, ability modifiers, initiative, saves, skills, passives, spell attack bonus and save DC, live AC, weapon attacks, attunement limit) from the stored `Character` and content; exports `WeaponAttack` and `ComputedStats`. |
| `CharacterActionsService` | Builds the list of `CharacterAction`s (feature actions with activation type, source class and per-rest use counts) for the Actions view. |

### App-shell and preference services

| Service | Purpose |
|---|---|
| `BackgroundService` | Selected app background (`localStorage` key `dnd-vtt-background`); built-in options plus user images from `GET /api/backgrounds`; applies `bg-image-*` body classes and the per-route `bgOverlay` alpha. Exports `BUILTIN_BACKGROUND_OPTIONS`, `customBackgroundCss`. |
| `ColorSchemeService` | Color scheme (`dnd-vtt-color-scheme`; `gold`, `crimson`, `emerald`, `royal-blue`, `silver`, default `gold`); sets `data-theme` on `<html>`. Exports `COLOR_SCHEME_OPTIONS`. |
| `UiScaleService` | UI scale via the root font size; exports `UI_SCALE_OPTIONS`. |
| `HubViewService` | Player hub layout preferences: which panel fills the main column (`HubView` = `'wiki' \| 'sheet'`) and the sidebar width. |
| `RecentActivityService` | Per-browser "recently viewed" timestamps for characters (`dnd-char-viewed`) and campaigns (`dnd-campaign-viewed`); sorting helpers for the dashboard. |
| `PwaService` | `online`, `installAvailable`, `installed`, `reconnecting` signals; captures `beforeinstallprompt`; `install()`; prompts to reload when `SwUpdate` reports `VERSION_READY`; uses `@capacitor/network` on native. See [frontend-ui.md](frontend-ui.md#pwa-and-service-worker). |
| `NativeLifecycleService` | On native platforms only: when the app returns to the foreground it refreshes the session, re-authenticates the socket and reloads `PlayerContextService`. |

Sources: `dnd_vtt_frontend/src/app/core/services/` (each `*.service.ts`; `ContentService.invalidateContent`, `SocketService.refreshAuthentication`, `AuthTokenService.refresh`).

## Models

`models/*.model.ts`: TypeScript interfaces that mirror backend payloads. Field-casing rules are in [CLAUDE.md](../../CLAUDE.md); table and JSON-blob definitions are in [../data-model.md](../data-model.md).

| File | Main exports |
|---|---|
| `campaign.model.ts` | `Campaign`, `CampaignMember`, `CampaignJoinPreview`, `CampaignHub`, `CampaignSession`, battle-map types (`BattleMap`, `MapToken`, `MapFog`, `MapLight`, `MapLighting`, `MapWall`, `UniversalVTTData`) and map-tool UI types (`MeasureShape`, `Measurement`, `FogToolName`, `LightToolName`, `PlacingEntity`) |
| `character.model.ts` | `Character`, `AbilityScores`, `Ability`, `ScoreMethod`, `CharacterCreationStatus`, `EquipmentEntry`, `SpellEntry`, `GrantedSpellEntry`, `PactWeaponState`, `Currency`, `DeathSaves` |
| `companion.model.ts` | `Companion`, `CompanionAction`, `CompanionResponse` |
| `encounter.model.ts` | `Encounter`, `EncounterLevel`, `MyEncounterLevel`, `TurnState`, `EncounterStartedEvent`, `PartyLeveledEvent`, `PresentPlayer` |
| `player.model.ts` | `PlayerBootstrap`, `PlayerCharacterSummary`, `PlayerCampaignSummary`, `PlayerCurrentContext`, `PlayerEncounterState`, `PlayerMapState`, `PlayerMapToken` |
| `session.model.ts` | `Session` |
| `user.model.ts` | `UserProfile`, `UserRole` |
| `wiki.model.ts` | `WikiPage`, `WikiPageSummary`, `WikiPageResponse`, `WikiBacklink`, `WikiSearchHit`, `WikiGraph`, `WikiGraphNode`, `WikiVisibility`, create/update payloads |
| `token-border.model.ts` | `TokenBorder`, `TokenBorderPattern`, `TokenBorderMaterial`, `TokenPopOutRange` |
| `avatar.model.ts` | `AvatarRecipeV1`, `PortraitSource`, `AvatarStyleDefinition`, `AvatarCategoryDefinition`, `AvatarPartDefinition`, `AvatarColorDefinition` |

Content-schema types (classes, races, items, spells, monsters, trait grants) are not in `models/`; they are exported from `services/content.service.ts`.

Sources: `dnd_vtt_frontend/src/app/core/models/*.model.ts`.

## Utils

`utils/*.ts`: pure helpers without Angular injection. Most have a `*.spec.ts` beside them.

| File | Purpose (main exports) |
|---|---|
| `avatar.ts` | Avatar recipe handling and portrait sources: `normalizeAvatarRecipe`, `avatarRecipeKey`, `portraitSource`, `portraitDataUri`, `isPortraitImageUrl`, randomizers, `legacySeedToAvatarRecipe`, `clearAvatarUriCache`; `AVATAR_STYLE_DEFINITIONS` |
| `background-origin-feat.ts` | `resolveBackgroundOriginFeat`: finds the origin feat named by a background's `feature` text |
| `background-skills.ts` | `resolveBackgroundSkills`, `BACKGROUND_SKILLS_KEY` |
| `character-effects.ts` | Evaluates trait/feat/item effects for a character: `collectTraitEffects`, `collectFeatEffects`, `activeEffects`, `evaluateCondition`, `reachableGrants`, `baseArmorClass`, `unarmoredDefenseBonus`, equipped/attuned item helpers (`equippedItems`, `attunementActive`, `activeMagicItems`), `resolveLanguageProficiencies`, `averageHpFormula` |
| `content-index.ts` | `toContentIndex`: display name to content index (`"Half Elf"` → `"half-elf"`) |
| `content-sources.ts` | Content-source toggles: `sourceCode`, `characterContentEnabled`, `campaignContentEnabled` |
| `currency.ts` | `CURRENCY_ORDER`, `adjustCurrency` (spend/earn across cp/sp/ep/gp/pp with change-making) |
| `error-message.ts` | `getErrorMessage(err, fallback)`: user-displayable message from a caught error |
| `level-up.ts` | `levelUpBaseline`, `levelUpPending`: whether a self-serve level-up is outstanding (including the heuristic for characters without `applied_level`) |
| `monster-speed.ts` | `monsterSpeedText`: 2024 stat-block speed string |
| `monster-token.ts` | `monsterTokenUrl`: `/uploads/monster-tokens/<index>.webp` |
| `player-perspective.ts` | `tokensAsPlayersSee`, `lightingAsPlayersSee`: client-side mirror of the backend's player-token serializer for the DM's pop-out table view |
| `progressive-choice.ts` | `resolveProgressiveChoiceLimit`: choice count by class level |
| `spellcasting.ts` | Spellcasting resolution and spell classification: `resolveSpellcasting`, `isSpellAttack`, `isSavingThrowSpell`, `isSpellAttackAction`, `resolveSpellAttackDamage`, `resolveSpellAttackNote`, `describeSpellUpcast` |
| `starting-equipment.ts` | Starting-equipment choice state helpers: `equipmentMode`, `withMode`, `groupOptionKey`, `withGroupOption`, `categoryPick`, `withCategoryPick`, `categoryOptions`, `resolveStartingEquipment`, `isEquipmentComplete`, `isStructuredEquipment` |
| `statblock-export.ts` | `monsterStatblock`, `characterStatblock`, `toYaml`, `statblockNote`, `statblockFileName` |
| `storage-keys.ts` | `ACTIVE_DRAFT_KEY`, `ACTIVE_DRAFT_STEP_KEY`, `readStoredWidth`, `persistWidth`; naming rule for new keys is in the file header |
| `token-border.ts` | Token border/pop-out configuration and Canvas drawing: `TOKEN_BORDER_*` constants, `DEFAULT_TOKEN_BORDER`, `normalizeTokenBorder`, `drawBorderedToken`, `drawTokenFace`, `strokeTokenBorder`, `drawTokenPopOut`, `popOutContains`, `popOutSides`, `artHasTransparency`, `maxTokenRadiusForPopout`, `tokenBorderInnerRadius` |
| `uvtt-walls.ts` | `wallsFromUniversalVtt`: converts a Universal VTT (`.dd2vtt`) export into `MapWall[]` |
| `weapon-proficiency.ts` | `weaponMatchesProficiency`, `weaponMatchesAnyProficiency` |

Tests without a same-named source file: `parity.spec.ts`.

Sources: `dnd_vtt_frontend/src/app/core/utils/*.ts`.

## Avatar assets

`avatar/` (not a `utils`/`models` folder):

| File | Purpose |
|---|---|
| `layered-avatar.ts` | Layer order (`AVATAR_LAYER_ORDER`) `LayeredAvatarPack`, `renderLayeredAvatar` (recipe + pack → string) |
| `lorelei.catalog.ts` | Part catalogue for the Lorelei avatar style |
| `custom-avatar-assets.generated.ts` | Generated by `avatar-assets/compile.mjs` ("Do not edit by hand"); currently exports an empty `GENERATED_LAYERED_AVATAR_PACKS` |

`npm run avatars:build` (frontend `package.json`) runs `avatar-assets/compile.mjs` (repo-root `avatar-assets/`) and is hooked as `prebuild`, `prebuild:dev` and `prewatch`.

Sources: `dnd_vtt_frontend/src/app/core/avatar/`, `dnd_vtt_frontend/package.json`.
