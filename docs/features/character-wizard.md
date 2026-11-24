# Feature: character wizard — creating and editing characters step by step, with autosaved drafts, a live sheet preview and a one-shot level-up mode.

Last updated: 2026-10-28 (commit 00cb49a)

`CharacterWizardComponent` (`features/characters/character-wizard/`, about 1450 lines) is a reusable component. It is mounted by three routed pages and embedded in the DM and player campaign hubs. Storage and endpoints: [api/characters.md](../api/characters.md); the `data` blob it writes: [data-model.md](../data-model.md#character-data-blob); the content it reads: [architecture/content.md](../architecture/content.md).

## Where it runs

| Route / host | Page component | Mode |
|---|---|---|
| `/home/characters/new` | `CharacterWizardPageComponent` | Create. With no id in the URL, resumes the draft whose id is in `localStorage` (`ACTIVE_DRAFT_KEY` = `character.active-draft-id`) if it is still a draft |
| `/home/characters/:id/edit` | `CharacterWizardPageComponent` | Edit an existing character |
| `/home/characters/:id/level-up` (`levelUpPendingGuard`) | `CharacterLevelUpPageComponent` | [Level-up mode](#level-up-mode) |
| DM and player campaign hubs | embedded `<app-character-wizard>` | Edit a campaign copy ([campaigns.md](campaigns.md)) |

Inputs and outputs: `character`, `levelUp`; `saved`, `cancelled`, `viewSheet`. After save or cancel the page navigates to `/home/characters`; "View Sheet" opens `/home/characters/:id?from=wizard`, whose back button returns to the wizard ([characters.md](characters.md#sheet-page)).

Sources: `dnd_vtt_frontend/src/app/features/characters/character-wizard-page/character-wizard-page.ts`, `dnd_vtt_frontend/src/app/features/characters/character-level-up-page/character-level-up-page.ts`, `dnd_vtt_frontend/src/app/core/guards/level-up-pending.guard.ts`, `dnd_vtt_frontend/src/app/core/utils/storage-keys.ts`, `dnd_vtt_frontend/src/app/app.routes.ts`.

## Steps

The step list is `STEPS = ['Class', 'Race', 'Background', 'Ability Scores', 'Equipment', 'Spells']` (class first). Each step is a component under `steps/`:

| Step | Component | What it does |
|---|---|---|
| Class | `ClassStepComponent` | Pick one or more classes (`ClassEntry`: class, level, subclass, skills, traits). Class levels describe their choices as `TraitGrant`s (`feature`, `choice`, `skill_choice`, `weapon_mastery`, `ability_choice`, `feat_pick`) rendered generically; ability-score-improvement slots can take a feat if the prerequisite is met (`qualifiesForFeat`). |
| Race | `RaceStepComponent` | Species, subrace and species trait choices |
| Background | `BackgroundStepComponent` | Background, its skills and tools, and its origin feat (`resolveBackgroundOriginFeat`) |
| Ability Scores | `AbilitiesStepComponent` | Method `standard` (standard array), `pointbuy` (budget, min and max constants from `character.model.ts`) or `manual` |
| Equipment | `EquipmentStepComponent` + `EquipmentChoiceComponent` | Starting-equipment choices from class and background |
| Spells | `SpellsStepComponent` | Cantrips and known/prepared spells, with always-prepared spells folded in |

Completion checks for each step are pure functions in `wizard-completion.ts` (`isRaceSelectionComplete`, `areClassSelectionsComplete`, `isBackgroundSelectionComplete`, `areAbilityAssignmentsComplete`, `areStartingEquipmentChoicesComplete`). Feat and effect grants (`abilityIncrease`, `effects`) are applied by the wizard once a feat is picked ([CLAUDE.md](../../CLAUDE.md) describes the grant vocabulary; the content schema is in [architecture/content.md](../architecture/content.md)).

**Content sources.** The wizard keeps a set `enabledSources` (default `XPHB`) saved as `enabled_sources` on the character; for a campaign copy the choices are limited by the campaign's `allowed_sources`.

**Max HP.** The header has a manual Max-HP field; clearing it falls back to the average progression. `carriedCurrentHp` (`wizard-hp.ts`) adds any max-HP gain to current HP and clamps to max, so levelling up heals by the gain.

`steps/details-step/details-step.ts` declares `app-details-step`, but no template uses it and `STEPS` has no details entry.

Sources: `dnd_vtt_frontend/src/app/features/characters/character-wizard/character-wizard.ts` (`STEPS`, `enabledSources`, `setMaxHpOverride`, `visibleStepIndices`), `dnd_vtt_frontend/src/app/features/characters/character-wizard/steps/`, `dnd_vtt_frontend/src/app/features/characters/character-wizard/wizard-completion.ts`, `dnd_vtt_frontend/src/app/features/characters/character-wizard/wizard-hp.ts`, `dnd_vtt_frontend/src/app/core/models/character.model.ts` (`ScoreMethod`).

## Autosave and drafts

In create and edit modes the wizard saves automatically: an effect watches every field (race, classes, background, assignments, equipment, spell choices, sources, HP, inspiration, active step) and calls `scheduleSave()` once initialised. Saves are serialised: a save requested while one is in flight is queued and re-run with the latest draft. On destroy a pending save is flushed.

| State of the record | Call | Endpoint |
|---|---|---|
| No id yet | `createDraft(draft, step)` | `POST /api/characters/drafts` |
| Existing, `creation_status = 'draft'` | `updateDraft(id, draft, step)` | `PATCH /api/characters/:id/draft` |
| Existing, complete | `saveCharacter(draft)` | `PUT /api/characters/:id` |
| Finish on a draft | `completeDraft(id)` after a final save | `POST /api/characters/:id/complete` |

While a draft exists its id and current step are kept in `localStorage` (`character.active-draft-id`, `character.active-draft-step`) and removed on finish. The preview-pane width fraction is stored under `dnd-vtt-wizard-preview-fraction` (25–75 %). Campaign copies cannot use the draft endpoints (`403`), so copies are always saved with `PUT`, where the server applies the lock rules ([characters.md](characters.md#personal-characters-and-campaign-copies)).

Sources: `dnd_vtt_frontend/src/app/features/characters/character-wizard/character-wizard.ts` (`scheduleSave`, `save`, `runSaves`, `saveOnce`, `finish`, `ngOnDestroy`, `PREVIEW_FRACTION_KEY`), `dnd_vtt_frontend/src/app/core/services/character.service.ts` (`createDraft`, `updateDraft`, `completeDraft`, `saveCharacter`), `dnd_vtt_backend/src/characters/characters.controller.ts`.

## Live preview

Beside the steps, a resizable pane renders `CharacterPlaySheetComponent` with `preview=true` for the unsaved draft, so every choice is reflected immediately in the real sheet ([characters.md](characters.md#play-sheet)). Fully derived values come from `CharacterStatsService`, not from the wizard.

Sources: `dnd_vtt_frontend/src/app/features/characters/character-wizard/character-wizard.html` (`wizard-preview`), `dnd_vtt_frontend/src/app/features/characters/character-play-sheet/character-play-sheet.ts` (`preview` input).

## Level-up mode

**What the player sees.** When the DM raises the party level (`PATCH /api/campaigns/:id/party-level`, [campaigns.md](campaigns.md#dm-campaign-hub)), each member's campaign copy gets a higher `level` while `applied_level` stays behind. The shell shows a banner, and the dashboard, character list, play sheet and party list show a level-up link ([shell-and-dashboard.md](shell-and-dashboard.md)). The link opens `/home/characters/:id/level-up`, where the wizard runs with `levelUp=true`:

- only the Class and Spells steps are visible (`visibleStepIndices` = `[0, 5]`);
- only the newly reached level's grants are editable (`minEditableLevel` on the class step; baseline from `levelUpBaseline`);
- the Max-HP field is pre-seeded with the previous total plus the new level's average;
- there is no autosave and no draft bookmark: one write on **Apply Level-Up** via `characterService.applyLevelUp` → `POST /api/characters/:id/level-up`, which the backend accepts even on a DM-locked copy, applies only `LEVEL_UP_EDITABLE_FIELDS`, and rejects with `409` when nothing is pending;
- closing discards unsaved picks; errors appear in the footer.

`levelUpPendingGuard` lets the route open when `applied_level` is missing or below `level`, otherwise redirects to the sheet.

Sources: `dnd_vtt_frontend/src/app/features/characters/character-wizard/character-wizard.ts` (`levelUp`, `levelUpBaseline`, `saveOnce`, `cancelAndSave`), `dnd_vtt_frontend/src/app/core/guards/level-up-pending.guard.ts`, `dnd_vtt_frontend/src/app/core/utils/level-up.ts`, `dnd_vtt_backend/src/characters/characters.service.ts` (`applyLevelUp`), `dnd_vtt_backend/src/campaigns/campaigns.service.ts` (`setPartyLevel`).

## Limitations

- Level-up mode computes its HP baseline from `levelUpBaseline()`, which is 0 for a multiclass character; the wizard then falls back to one level back (`Math.max(1, level - 1)`), so a multiclass level-up assumes exactly one pending level.
- Campaign copies are edited under the lock rules; full editing needs DM unlock.

Sources: `dnd_vtt_frontend/src/app/features/characters/character-wizard/character-wizard.ts` (`levelUpBaseline`), `dnd_vtt_frontend/src/app/core/utils/level-up.ts`.
