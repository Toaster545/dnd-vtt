import { Component, inject, signal, computed, effect, output, OnInit, OnDestroy, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ContentService, DndContentSource, DndRace, DndClass, DndBackground, DndItem, DndSpell, DndFeat, TraitEffect, TraitGrant } from '../../../core/services/content.service';
import { ClassChoiceSource, averageHpFormula, collectFeatEffects, collectTraitEffects, reachableGrants, resolveCharacterFeatPicks, resolveLanguageProficiencies, unarmoredDefenseBonus } from '../../../core/utils/character-effects';
import { isStructuredEquipment, resolveStartingEquipment } from '../../../core/utils/starting-equipment';
import { resolveBackgroundSkills } from '../../../core/utils/background-skills';
import { resolveBackgroundOriginFeat } from '../../../core/utils/background-origin-feat';
import { portraitDataUri, randomPortraitSeed } from '../../../core/utils/avatar';
import { resolveSpellcasting, type SpellSelectionRequirement } from '../../../core/utils/spellcasting';
import { CharacterService } from '../../../core/services/character.service';
import { CharacterStatsService } from '../../../core/services/character-stats.service';
import { CampaignService } from '../../../core/services/campaign.service';
import { Character, Ability, ABILITIES, ScoreMethod, POINT_BUY_MIN, defaultCharacter, abilityModifier } from '../../../core/models/character.model';
import { PortraitPickerDialogComponent } from '../../../shared/portrait-picker-dialog/portrait-picker-dialog';
import { ContentSourceDialogComponent } from '../../../shared/components/content-source-dialog/content-source-dialog';
import { RaceStepComponent, Subrace, RaceChoice } from './steps/race-step/race-step';
import { ClassStepComponent, ClassEntry } from './steps/class-step/class-step';
import { BackgroundStepComponent, BackgroundChoice } from './steps/background-step/background-step';
import { AbilitiesStepComponent } from './steps/abilities-step/abilities-step';
import { EquipmentStepComponent } from './steps/equipment-step/equipment-step';
import { SpellsStepComponent } from './steps/spells-step/spells-step';
import { DetailsStepComponent } from './steps/details-step/details-step';
import { CharacterPreviewComponent } from './character-preview/character-preview';
import {
  areAbilityAssignmentsComplete,
  areClassSelectionsComplete,
  areStartingEquipmentChoicesComplete,
  isBackgroundSelectionComplete,
  isRaceSelectionComplete,
} from './wizard-completion';

const STEPS = ['Class', 'Race', 'Background', 'Ability Scores', 'Equipment', 'Spells', 'Details'];
const ACTIVE_DRAFT_KEY = 'character.active-draft-id';
const ACTIVE_DRAFT_STEP_KEY = 'character.active-draft-step';

@Component({
  selector: 'app-character-wizard',
  imports: [
    FormsModule,
    MatIconModule,
    MatTooltipModule,
    RaceStepComponent,
    ClassStepComponent,
    BackgroundStepComponent,
    AbilitiesStepComponent,
    EquipmentStepComponent,
    SpellsStepComponent,
    DetailsStepComponent,
    CharacterPreviewComponent,
  ],
  templateUrl: './character-wizard.html',
  styleUrl: './character-wizard.scss',
})
export class CharacterWizardComponent implements OnInit, OnDestroy {
  private content          = inject(ContentService);
  private characterService = inject(CharacterService);
  private statsService     = inject(CharacterStatsService);
  private campaignService  = inject(CampaignService);
  private dialog           = inject(MatDialog);

  readonly character  = input<Character | null>(null);
  readonly saved      = output<void>();
  readonly cancelled  = output<void>();
  readonly viewSheet  = output<string>();

  readonly steps = STEPS;

  activeStep = signal(0);

  races       = signal<DndRace[]>([]);
  classes     = signal<DndClass[]>([]);
  backgrounds = signal<DndBackground[]>([]);
  items       = signal<DndItem[]>([]);
  spells      = signal<DndSpell[]>([]);
  spellLists  = signal<Record<string, string[]>>({});
  feats       = signal<DndFeat[]>([]);
  sources     = signal<DndContentSource[]>([]);
  enabledSources = signal<Set<string>>(new Set(['XPHB']));
  campaignAllowedSources = signal<Set<string> | null>(null);
  loading     = signal(true);

  private allRaces: DndRace[] = [];
  private allClasses: DndClass[] = [];
  private allBackgrounds: DndBackground[] = [];
  private allItems: DndItem[] = [];
  private allSpells: DndSpell[] = [];
  private allFeats: DndFeat[] = [];

  selectedItemIndices = signal<Set<string>>(new Set());
  spellChoices        = signal<Record<string, string[]>>({});
  classEquipChoices      = signal<Record<string, string[]>>({});
  backgroundEquipChoices = signal<Record<string, string[]>>({});

  characterId        = signal<string | null>(null);
  // The full record being edited, kept as-loaded (not just the fields the wizard's own steps
  // manage) so draftCharacter can preserve everything else — see the comment there.
  private existingCharacter = signal<Character | null>(null);
  selectedRace       = signal<DndRace | null>(null);
  selectedSubrace    = signal<Subrace | null>(null);
  raceTraits         = signal<Record<string, string[]>>({});
  selectedClasses    = signal<ClassEntry[]>([]);
  selectedBackground = signal<DndBackground | null>(null);
  backgroundTraits   = signal<Record<string, string[]>>({});

  raceSelection = computed<RaceChoice | null>(() => {
    const race = this.selectedRace();
    return race ? { race, subrace: this.selectedSubrace(), traits: this.raceTraits() } : null;
  });

  backgroundSelection = computed<BackgroundChoice | null>(() => {
    const background = this.selectedBackground();
    return background ? { background, traits: this.backgroundTraits() } : null;
  });

  assignments = signal<Record<Ability, number | null>>({
    strength: null, dexterity: null, constitution: null,
    intelligence: null, wisdom: null, charisma: null,
  });
  scoreMethod = signal<ScoreMethod>('standard');

  characterName = signal('');
  portraitSeed  = signal(randomPortraitSeed());
  portraitUri   = computed(() => portraitDataUri(this.portraitSeed()));
  level         = signal(1);
  alignment     = signal('True Neutral');
  currentHp     = signal<number | null>(null);
  saving        = signal(false);
  saveStatus    = signal<'idle' | 'saving' | 'saved'>('idle');

  primaryClass = computed(() => this.selectedClasses()[0]?.cls ?? null);

  // Raw assigned scores only — species no longer grant ability bonuses (2024 rules moved that
  // to Background instead), so there's no racial layer here anymore.
  assignedScores = computed(() => {
    const assigned = this.assignments();
    return ABILITIES.reduce((acc, ab) => ({ ...acc, [ab]: assigned[ab] ?? 0 }), {} as Record<Ability, number>);
  });

  // Sum of a single ability_choice grant's picks (Background's ability score increase, or a
  // class/subclass Ability Score Improvement) — shared by both bonus computeds below.
  private sumAbilityChoicePicks(
    grants: { grants?: TraitGrant[] }[],
    traits: Record<string, string[]>,
  ): Record<Ability, number> {
    const bonus: Record<Ability, number> = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
    for (const source of grants) {
      for (const grant of source.grants ?? []) {
        if (grant.type !== 'ability_choice') continue;
        for (const ability of traits[grant.key] ?? []) {
          if (ability in bonus) bonus[ability as Ability] += 1;
        }
      }
    }
    return bonus;
  }

  backgroundAbilityBonus = computed(() => {
    const bg = this.selectedBackground();
    return this.sumAbilityChoicePicks(bg ? [bg] : [], this.backgroundTraits());
  });

  // A feat taken in place of an ASI (or via feat_pick) can itself carry a +1 ability increase;
  // folds that into the bonus map, using `chosenAbility` when the feat offers more than one.
  private applyFeatAbilityBonus(
    bonus: Record<Ability, number>, featIndex: string | undefined, chosenAbility: string | undefined,
  ) {
    if (!featIndex) return;
    const inc = this.feats().find(f => f.index === featIndex)?.abilityIncrease;
    if (!inc) return;
    const ability = inc.abilities.length === 1 ? inc.abilities[0] : chosenAbility;
    if (ability && ability in bonus) bonus[ability as Ability] += inc.amount;
  }

  // Sum of every ability_choice (Ability Score Improvement) point spent, plus the ability
  // increase baked into any feat taken instead (or via a feat_pick grant), across all selected
  // classes and subclasses.
  private classAbilityBonuses = computed(() => {
    const bonus: Record<Ability, number> = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
    for (const entry of this.selectedClasses()) {
      const subclass = entry.cls.subclasses.find(s => s.name === entry.subclass);
      const levels = [...entry.cls.levels, ...(subclass?.levels ?? [])];
      for (const lvl of levels) {
        for (const grant of lvl.grants ?? []) {
          if (grant.type === 'ability_choice') {
            for (const ability of entry.traits[grant.key] ?? []) {
              if (ability in bonus) bonus[ability as Ability] += 1;
            }
            this.applyFeatAbilityBonus(bonus, entry.traits[`${grant.key}:feat`]?.[0], entry.traits[`${grant.key}:feat_ability`]?.[0]);
          } else if (grant.type === 'feat_pick') {
            for (const featIndex of entry.traits[grant.key] ?? []) {
              this.applyFeatAbilityBonus(bonus, featIndex, entry.traits[`${grant.key}:feat_ability`]?.[0]);
            }
          }
        }
      }
    }
    return bonus;
  });

  // Everything except the category being edited — the validation baseline each step's ASI
  // picker needs so its own 20-cap check accounts for bonuses coming from elsewhere.
  scoresBeforeClassASI = computed(() => {
    const base = this.assignedScores();
    const bg = this.backgroundAbilityBonus();
    return ABILITIES.reduce((acc, ab) => ({ ...acc, [ab]: base[ab] + bg[ab] }), {} as Record<Ability, number>);
  });
  scoresBeforeBackgroundASI = computed(() => {
    const base = this.assignedScores();
    const cls = this.classAbilityBonuses();
    return ABILITIES.reduce((acc, ab) => ({ ...acc, [ab]: base[ab] + cls[ab] }), {} as Record<Ability, number>);
  });

  // Combined bonus from every source above the raw assignment — shown as a single badge in the
  // Abilities step (it doesn't need to distinguish where each point came from).
  bonusScores = computed(() => {
    const bg = this.backgroundAbilityBonus();
    const cls = this.classAbilityBonuses();
    return ABILITIES.reduce((acc, ab) => ({ ...acc, [ab]: bg[ab] + cls[ab] }), {} as Record<Ability, number>);
  });

  finalScores = computed(() => {
    const base = this.assignedScores();
    const bonus = this.bonusScores();
    return ABILITIES.reduce((acc, ab) => ({ ...acc, [ab]: base[ab] + bonus[ab] }), {} as Record<Ability, number>);
  });

  profBonus  = computed(() => Math.ceil(this.level() / 4) + 1);
  maxHP      = computed(() => {
    const cls = this.primaryClass();
    if (!cls) return 10;
    const conMod = abilityModifier(this.finalScores().constitution);
    // e.g. Tough: +2 max HP per character level, on top of the normal hit-die progression.
    const perLevelBonus = this.selectedEffects('hp_bonus_per_level').reduce((sum, e) => sum + (e.value ?? 0), 0);
    return averageHpFormula(this.level(), cls.hit_die, conMod, perLevelBonus);
  });
  // Scans every chosen class option and feat for a structured `effects` entry of the given
  // type. Conditioned effects (e.g. Defense's ac_bonus "while wearing armor") are excluded —
  // those are evaluated live from equipped gear by CharacterStatsService instead.
  private selectedEffects(type: string, includeConditional = false): TraitEffect[] {
    const race = this.selectedRace();
    const backgroundFeat = resolveBackgroundOriginFeat(this.selectedBackground(), this.feats());
    const backgroundFeatEffects = collectFeatEffects(backgroundFeat, this.backgroundTraits());
    return [...collectTraitEffects(
      this.selectedClasses().map(e => ({ data: e.cls, choices: e.traits, level: e.level, subclass: e.subclass })),
      this.feats(),
      race ? { data: race, choices: this.raceTraits(), subrace: this.selectedSubrace()?.name } : null,
    ), ...backgroundFeatEffects]
      .filter(e => e.type === type && (includeConditional || !e.condition));
  }

  armorClass = computed(() => {
    const bonus = this.selectedEffects('ac_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0);
    const modifiers = Object.fromEntries(
      ABILITIES.map(ability => [ability, abilityModifier(this.finalScores()[ability])]),
    );
    const unarmored = unarmoredDefenseBonus(this.selectedEffects('unarmored_defense', true), modifiers);
    return 10 + abilityModifier(this.finalScores().dexterity) + bonus + unarmored;
  });
  speed      = computed(() => {
    const base = this.selectedRace()?.speed ?? 30;
    // Character creation starts unarmored, so no-heavy-armor speed effects are active here;
    // the saved value can still be manually adjusted if the character later dons Heavy Armor.
    const bonus = this.selectedEffects('speed_bonus', true).reduce((sum, effect) => sum + (effect.value ?? 0), 0);
    return base + bonus;
  });
  isEditing  = computed(() => this.characterId() !== null);
  isLastStep = computed(() => this.activeStep() === STEPS.length - 1);
  incompleteSteps = computed(() => [
    !areClassSelectionsComplete(this.selectedClasses(), this.feats()) || this.classHasSkillConflict(),
    !isRaceSelectionComplete(this.raceSelection(), this.feats()) || this.raceHasSkillConflict(),
    !isBackgroundSelectionComplete(this.backgroundSelection(), this.feats()) || this.backgroundHasSkillConflict(),
    !areAbilityAssignmentsComplete(this.assignments(), this.scoreMethod()),
    !areStartingEquipmentChoicesComplete(
      this.primaryClass(),
      this.selectedBackground(),
      this.classEquipChoices(),
      this.backgroundEquipChoices(),
    ),
    !this.spellResolution().isComplete,
    false, // Alignment has a valid default and Details has no unfilled choice.
  ]);

  stepNeedsAttention(index: number): boolean {
    return this.incompleteSteps()[index] ?? false;
  }

  private backgroundSkillNames = computed(() => {
    const ordinary = resolveBackgroundSkills(this.selectedBackground(), this.backgroundTraits());
    const originFeat = resolveBackgroundOriginFeat(this.selectedBackground(), this.feats());
    const fromFeat = (originFeat?.grants ?? [])
      .filter((grant): grant is Extract<TraitGrant, { type: 'skill_choice' }> => grant.type === 'skill_choice')
      .flatMap(grant => this.backgroundTraits()[grant.key] ?? []);
    return [...ordinary, ...fromFeat];
  });

  private classSkillNames = computed(() => {
    const initial = this.selectedClasses().flatMap(entry => entry.skills);
    const additional = this.selectedClasses().flatMap(entry =>
      reachableGrants(entry.cls, entry.subclass, entry.level)
        .filter((grant): grant is Extract<TraitGrant, { type: 'skill_choice' }> =>
          grant.type === 'skill_choice' && grant.key !== 'skills')
        .flatMap(grant => entry.traits[grant.key] ?? []),
    );
    return [...initial, ...additional];
  });

  private raceSkillNames = computed(() => {
    const race = this.selectedRace();
    const subrace = this.selectedSubrace();
    return [...(race?.grants ?? []), ...(subrace?.grants ?? [])]
      .filter((grant): grant is Extract<TraitGrant, { type: 'skill_choice' }> => grant.type === 'skill_choice')
      .flatMap(grant => this.raceTraits()[grant.key] ?? []);
  });

  raceUnavailableSkills = computed(() => [...new Set([
    ...this.classSkillNames(),
    ...this.backgroundSkillNames(),
  ])]);

  classUnavailableSkills = computed(() => [...new Set([
    ...this.raceSkillNames(),
    ...this.backgroundSkillNames(),
  ])]);

  backgroundUnavailableSkills = computed(() => [...new Set([
    ...this.raceSkillNames(),
    ...this.classSkillNames(),
  ])]);

  private raceHasSkillConflict = computed(() =>
    this.raceSkillNames().some(skill => this.raceUnavailableSkills().includes(skill))
    || new Set(this.raceSkillNames()).size !== this.raceSkillNames().length);

  private classHasSkillConflict = computed(() =>
    this.classSkillNames().some(skill => this.classUnavailableSkills().includes(skill))
    || new Set(this.classSkillNames()).size !== this.classSkillNames().length);

  private backgroundHasSkillConflict = computed(() =>
    this.backgroundSkillNames().some(skill => this.backgroundUnavailableSkills().includes(skill))
    || new Set(this.backgroundSkillNames()).size !== this.backgroundSkillNames().length);

  private skillsRecord = computed(() => {
    const effectSkills = this.selectedEffects('skill_proficiency')
      .flatMap(effect => effect.tags ?? []);
    return [...new Set([
      ...this.backgroundSkillNames(),
      ...this.classSkillNames(),
      ...this.raceSkillNames(),
      ...effectSkills,
    ])]
      .reduce((acc, s) => ({ ...acc, [s]: true }), {} as Record<string, boolean>);
  });

  proficientSkillNames = computed(() => Object.keys(this.skillsRecord()));

  private expertiseRecord = computed(() => this.selectedClasses()
    .flatMap(entry => reachableGrants(entry.cls, entry.subclass, entry.level)
      .filter((grant): grant is Extract<TraitGrant, { type: 'expertise_choice' }> =>
        grant.type === 'expertise_choice')
      .flatMap(grant => entry.traits[grant.key] ?? []))
    .reduce((record, skill) => ({ ...record, [skill]: true }), {} as Record<string, boolean>));

  private languages = computed(() => resolveLanguageProficiencies(
    this.raceTraits()['languages'] ?? [],
    this.selectedEffects('language_proficiency'),
  ));

  // What the class's and background's starting-equipment choice (gear bundle or flat gold)
  // actually resolves to right now — `null` sources (old, not-yet-migrated content) contribute
  // nothing rather than erroring.
  private resolvedClassEquipment = computed(() => {
    const equip = this.primaryClass()?.starting_equipment;
    return isStructuredEquipment(equip) ? resolveStartingEquipment(equip, this.classEquipChoices()) : { items: [], gold: 0 };
  });
  private resolvedBackgroundEquipment = computed(() => {
    const equip = this.selectedBackground()?.starting_equipment;
    return isStructuredEquipment(equip) ? resolveStartingEquipment(equip, this.backgroundEquipChoices()) : { items: [], gold: 0 };
  });

  // Only `gp` is ever populated today — nothing in starting equipment grants cp/sp/ep/pp — but
  // shown as a full breakdown (matching the play sheet's own currency display) since a manual
  // override or a future "buy gear with leftover gold" flow could put value in the others.
  startingCurrency = computed(() => ({
    cp: 0, sp: 0, ep: 0, gp: this.resolvedClassEquipment().gold + this.resolvedBackgroundEquipment().gold, pp: 0,
  }));

  // A single, non-multiclass character's class always tracks the overall level directly (there's
  // nothing else it could mean) — reconciled here synchronously rather than relying solely on the
  // level-sync effect below, so every computed reads a consistent level with no one-tick lag.
  private reconciledClasses = computed<ClassEntry[]>(() => {
    const classes = this.selectedClasses();
    return classes.length === 1 ? [{ ...classes[0], level: this.level() }] : classes;
  });

  private spellFeatSelections = computed(() => {
    const race = this.selectedRace();
    const selected = resolveCharacterFeatPicks(
      this.reconciledClasses().map(entry => ({
        data: entry.cls, choices: entry.traits, level: entry.level, subclass: entry.subclass,
      })),
      this.feats(),
      race ? { data: race, choices: this.raceTraits(), subrace: this.selectedSubrace()?.name } : null,
    );
    const background = this.selectedBackground();
    const originFeat = resolveBackgroundOriginFeat(background, this.feats());
    if (!background || !originFeat) return selected;
    const list = background.feature.match(/\((Cleric|Druid|Wizard)\)/i)?.[1];
    return [...selected, {
      feat: originFeat,
      scope: `background:${background.index}:origin`,
      choices: {
        ...this.backgroundTraits(),
        ...(list ? { magic_initiate_list: [list] } : {}),
      },
    }];
  });

  spellResolution = computed(() => resolveSpellcasting({
    characterLevel: this.level(),
    abilityScores: this.finalScores(),
    spells: this.spells(),
    spellLists: this.spellLists(),
    classes: this.reconciledClasses().map(entry => ({
      cls: entry.cls,
      level: entry.level,
      subclass: entry.subclass,
      choices: entry.traits,
    })),
    race: this.selectedRace() ? {
      race: this.selectedRace()!,
      subrace: this.selectedSubrace(),
      choices: this.raceTraits(),
    } : null,
    background: this.selectedBackground() ? {
      background: this.selectedBackground()!,
      choices: this.backgroundTraits(),
    } : null,
    feats: this.spellFeatSelections(),
    spellChoices: this.spellChoices(),
  }));

  // The character record as it stands right now, built straight from the wizard's live signals
  // — used both to persist (save(), below) and to drive the live preview pane, so the preview
  // is never more than a re-render behind what's actually on screen (no debounce, no round trip
  // through the backend).
  //
  // Based on the existing record (when editing) rather than a blank default, so fields the
  // wizard doesn't manage — equipped/prepared flags, currency spent in play, temp HP, conditions,
  // notes, etc. — survive an edit instead of being silently reset by the next autosave.
  draftCharacter = computed<Character>(() => {
    const classes = this.reconciledClasses();
    const primary  = classes[0];
    const existing = this.existingCharacter();

    const priorEquipment = new Map((existing?.equipment ?? []).map(e => [e.itemIndex, e]));
    const itemName = (index: string) => this.items().find(it => it.index === index)?.name ?? index;
    const structuredEquipment = [...this.resolvedClassEquipment().items, ...this.resolvedBackgroundEquipment().items]
      .map(r => ({
        itemIndex: r.itemIndex, name: itemName(r.itemIndex), quantity: r.quantity,
        equipped: priorEquipment.get(r.itemIndex)?.equipped ?? false,
      }));
    const freeEquipment = this.items()
      .filter(it => this.selectedItemIndices().has(it.index))
      .map(it => ({
        itemIndex: it.index, name: it.name,
        quantity: priorEquipment.get(it.index)?.quantity ?? 1,
        equipped: priorEquipment.get(it.index)?.equipped ?? false,
      }));
    const equipment = [...structuredEquipment, ...freeEquipment];

    const catalog = new Map(this.spells().map(spell => [spell.index, spell]));
    const resolved = this.spellResolution();
    const spellEntries = new Map<string, Character['spells'][number]>();
    for (const origin of [...resolved.known, ...resolved.spellbook, ...resolved.prepared, ...resolved.alwaysPrepared]) {
      const spell = catalog.get(origin.spellIndex);
      if (!spell) continue;
      const current = spellEntries.get(spell.index);
      const prepared = origin.category === 'prepared' || origin.category === 'always_prepared';
      const category = origin.category === 'always_prepared'
        ? 'always_prepared'
        : prepared ? 'prepared' : origin.category;
      spellEntries.set(spell.index, {
        spellIndex: spell.index,
        name: spell.name,
        prepared: (current?.prepared ?? false) || prepared,
        sourceKey: current?.sourceKey ?? origin.sourceKey,
        sourceName: current?.sourceName ?? origin.sourceName,
        category: current?.category === 'always_prepared' ? current.category : category,
        alwaysPrepared: (current?.alwaysPrepared ?? false) || origin.category === 'always_prepared',
      });
    }
    const spells = [...spellEntries.values()];
    const hp = this.maxHP();
    const previousMaxHp = existing?.max_hp;
    const hpGain = previousMaxHp !== undefined ? Math.max(0, hp - previousMaxHp) : 0;

    return {
      ...(existing ?? defaultCharacter()),
      id: this.characterId() ?? undefined,
      name: this.characterName().trim() || 'Unnamed Character',
      portrait_seed: this.portraitSeed(),
      race: this.selectedRace()?.name ?? '',
      subrace: this.selectedSubrace()?.name ?? '',
      race_choices: this.raceTraits(),
      class: primary?.cls.name ?? '',
      subclass: primary?.subclass ?? '',
      level: this.level(),
      classes: classes.map(e => ({ name: e.cls.name, level: e.level, subclass: e.subclass, choices: e.traits, skills: e.skills })),
      background: this.selectedBackground()?.name ?? '',
      background_choices: this.backgroundTraits(),
      languages: this.languages(),
      class_equipment_choices: this.classEquipChoices(),
      background_equipment_choices: this.backgroundEquipChoices(),
      alignment: this.alignment(),
      ability_scores: { ...this.finalScores() },
      max_hp: hp,
      // Clamped to the (possibly just-lowered) max — e.g. leveling a character down elsewhere
      // shrinks max_hp on the next wizard save, and current_hp shouldn't end up exceeding it.
      current_hp: Math.min((this.currentHp() ?? hp) + hpGain, hp),
      armor_class: this.armorClass(),
      speed: this.speed(),
      skills: this.skillsRecord(),
      expertise: this.expertiseRecord(),
      equipment,
      currency: existing?.currency ?? this.startingCurrency(),
      spells,
      spell_choices: this.spellChoices(),
      enabled_sources: [...this.enabledSources()],
    } as Character;
  });

  private classesForFeats = computed<ClassChoiceSource[]>(() =>
    this.reconciledClasses().map(e => ({ data: e.cls, choices: e.traits, level: e.level, subclass: e.subclass })),
  );

  previewStats = computed(() => this.statsService.compute(
    this.draftCharacter(), this.primaryClass(), this.selectedRace(),
    this.feats(), this.classesForFeats(), this.items(), this.selectedBackground(),
  ));

  private initialized = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // If a class's effective level drops (the overall level field lowered, or a multiclass split
    // redistributed), anything gained above the new level has to go — a level-1 character can't
    // "still have" a level-3 subclass or a level-4 ASI/feat pick. This only ever removes stale
    // picks; it never restores them if the level is later raised back up. Guarded by an actual
    // change check (not just re-set every run) so writing back to selectedClasses can't loop.
    effect(() => {
      const raw = this.selectedClasses();
      const reconciled = this.reconciledClasses();
      let changed = false;
      const next = reconciled.map((entry, i) => {
        const validKeys = new Set(
          reachableGrants(entry.cls, entry.subclass, entry.level)
            .flatMap(g => g.key ? [g.key, `${g.key}:feat`, `${g.key}:feat_ability`] : []),
        );
        const subclass = entry.level >= entry.cls.subclass_level ? entry.subclass : '';
        const staleKeys = Object.keys(entry.traits).some(k => !validKeys.has(k));
        if (entry.level === raw[i].level && subclass === entry.subclass && !staleKeys) return raw[i];
        changed = true;
        const traits = staleKeys
          ? Object.fromEntries(Object.entries(entry.traits).filter(([k]) => validKeys.has(k)))
          : entry.traits;
        return { ...entry, subclass, traits };
      });
      if (changed) this.selectedClasses.set(next);
    });

    effect(() => {
      this.characterName(); this.portraitSeed(); this.level(); this.alignment();
      this.selectedRace(); this.selectedSubrace(); this.raceTraits(); this.selectedClasses();
      this.selectedBackground(); this.backgroundTraits();
      this.assignments(); this.selectedItemIndices(); this.spellChoices();
      this.classEquipChoices(); this.backgroundEquipChoices();
      this.enabledSources();
      this.currentHp();
      const step = this.activeStep();

      if (!this.initialized) return;
      localStorage.setItem(ACTIVE_DRAFT_STEP_KEY, String(step));
      this.scheduleSave();
    });
  }

  ngOnDestroy() {
    if (this.saveTimer)  clearTimeout(this.saveTimer);
    if (this.statusTimer) clearTimeout(this.statusTimer);
  }

  async ngOnInit() {

    const campaignId = this.character()?.campaign_id ?? undefined;
    const [sources, races, classes, backgrounds, items, spells, spellLists, feats, campaign] = await Promise.all([
      this.content.getSources(),
      this.content.getRaces(),
      this.content.getClasses(),
      this.content.getBackgrounds(),
      this.content.getItems(campaignId),
      this.content.getSpells(campaignId),
      this.content.getSpellLists(),
      this.content.getFeats(),
      campaignId ? this.campaignService.getById(campaignId) : Promise.resolve(null),
    ]);
    this.sources.set(sources);
    this.allRaces = races;
    this.allClasses = classes;
    this.allBackgrounds = backgrounds;
    this.allItems = items;
    this.allSpells = spells;
    this.spellLists.set(spellLists);
    this.allFeats = feats;
    if (campaign) {
      this.campaignAllowedSources.set(new Set(campaign.allowed_sources));
    }

    const existing = this.character();
    this.enabledSources.set(new Set(existing?.enabled_sources ?? ['XPHB']));
    this.applySourceFilters();
    this.loading.set(false);

    if (existing) {
      this.existingCharacter.set(existing);
      this.characterId.set(existing.id ?? null);
      if (existing.creation_status === 'draft') {
        const localStep = Number(localStorage.getItem(ACTIVE_DRAFT_STEP_KEY));
        this.activeStep.set(Number.isInteger(localStep) && localStep >= 0 && localStep < STEPS.length
          ? localStep
          : Math.max(0, Math.min(STEPS.length - 1, existing.draft_step ?? 0)));
      }
      this.characterName.set(existing.name);
      this.portraitSeed.set(existing.portrait_seed ?? randomPortraitSeed());
      this.level.set(existing.level);
      this.alignment.set(existing.alignment);
      this.currentHp.set(existing.current_hp);
      const race = this.allRaces.find(r => r.name === existing.race) ?? null;
      const bg   = this.allBackgrounds.find(b => b.name === existing.background) ?? null;
      this.selectedRace.set(race);
      this.selectedBackground.set(bg);
      if (existing.subrace && race) {
        this.selectedSubrace.set(race.subraces.find(s => s.name === existing.subrace) ?? null);
      }
      const raceChoices = { ...(existing.race_choices ?? {}) };
      if (!raceChoices['languages']?.length && existing.languages?.length) {
        raceChoices['languages'] = existing.languages.filter(language => language !== 'Common').slice(0, 2);
      }
      this.raceTraits.set(raceChoices);
      this.backgroundTraits.set(existing.background_choices ?? {});
      this.classEquipChoices.set(existing.class_equipment_choices ?? {});
      this.backgroundEquipChoices.set(existing.background_equipment_choices ?? {});
      // Restore classes
      const classEntries = (existing.classes ?? (existing.class ? [{ name: existing.class, level: existing.level, subclass: existing.subclass }] : []))
        .map(c => {
          const cls = this.allClasses.find(cl => cl.name === c.name);
          if (!cls) return null;
          return { cls, level: c.level ?? existing.level, subclass: c.subclass ?? '', skills: c.skills ?? [], traits: c.choices ?? {} } as ClassEntry;
        })
        .filter((e): e is ClassEntry => e !== null);
      this.selectedClasses.set(classEntries);
      // Restore free-form "Other Equipment" picks — anything in the saved equipment array that
      // isn't accounted for by the class/background structured choices just restored above.
      // Without this, reopening a saved character starts selectedItemIndices empty, and the next
      // autosave (triggered by any unrelated field edit) silently drops those items from equipment.
      const structuredIndices = new Set([
        ...this.resolvedClassEquipment().items,
        ...this.resolvedBackgroundEquipment().items,
      ].map(r => r.itemIndex));
      this.selectedItemIndices.set(new Set(
        (existing.equipment ?? [])
          .map(e => e.itemIndex)
          .filter(index => !structuredIndices.has(index)),
      ));
      // Restore ability scores — reverse out both the Background's ability increase and any
      // class-level Ability Score Improvements (both computeds read signals already restored
      // above) to recover the raw values the player originally assigned.
      const scores = existing.ability_scores as Record<Ability, number>;
      if (scores) {
        const bonus = this.bonusScores();
        // The original method isn't stored, and reconstructed base values won't generally
        // fit the standard array or a point-buy budget — Manual Entry accepts any value.
        this.scoreMethod.set('manual');
        this.assignments.set(ABILITIES.reduce((acc, ab) => ({
          ...acc, [ab]: scores[ab] ? scores[ab] - bonus[ab] : null,
        }), {} as Record<Ability, number | null>));
      }
      this.spellChoices.set(existing.spell_choices ?? this.migrateLegacySpells(existing.spells ?? []));
    }

    setTimeout(() => { this.initialized = true; }, 0);
  }

  openSourcesDialog() {
    this.dialog.open(ContentSourceDialogComponent, {
      data: {
        sources: this.sources(),
        enabledCodes: [...this.enabledSources()],
        allowedCodes: this.campaignAllowedSources()
          ? [...this.campaignAllowedSources()!]
          : null,
      },
      width: '680px',
      maxWidth: '95vw',
      maxHeight: '85vh',
    }).afterClosed().subscribe((result: string[] | null | undefined) => {
      if (!result) return;
      this.enabledSources.set(new Set(result));
      this.applySourceFilters(true);
    });
  }

  private applySourceFilters(clearUnavailable = false) {
    const enabled = this.enabledSources();
    const include = <T extends { source?: { code: string } }>(entry: T) =>
      enabled.has(entry.source?.code ?? 'XPHB');
    this.races.set(this.allRaces.filter(include));
    this.classes.set(this.allClasses.filter(include).map(cls => ({
      ...cls,
      subclasses: cls.subclasses.filter(include),
    })));
    this.backgrounds.set(this.allBackgrounds.filter(include));
    this.items.set(this.allItems.filter(include));
    this.spells.set(this.allSpells.filter(include));
    this.feats.set(this.allFeats.filter(include));

    if (!clearUnavailable) return;
    if (this.selectedRace() && !include(this.selectedRace()!)) {
      this.selectedRace.set(null);
      this.selectedSubrace.set(null);
      this.raceTraits.set({});
    }
    this.selectedClasses.update(entries => entries.filter(entry => include(entry.cls)));
    if (this.selectedBackground() && !include(this.selectedBackground()!)) {
      this.selectedBackground.set(null);
      this.backgroundTraits.set({});
    }
    const itemIndexes = new Set(this.items().map(item => item.index));
    this.selectedItemIndices.update(indices =>
      new Set([...indices].filter(index => itemIndexes.has(index))),
    );
    const spellIndexes = new Set(this.spells().map(spell => spell.index));
    this.spellChoices.update(choices => Object.fromEntries(
      Object.entries(choices).map(([key, indexes]) => [
        key,
        indexes.filter(index => spellIndexes.has(index)),
      ]),
    ));
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveStatus.set('saving');
    this.saveTimer = setTimeout(() => this.save(), 1500);
  }

  openPortraitPicker() {
    this.dialog.open(PortraitPickerDialogComponent, {
      data: { seed: this.portraitSeed() },
      width: '440px',
    }).afterClosed().subscribe((result: string | null | undefined) => {
      if (result) this.portraitSeed.set(result);
    });
  }

  onRaceChosen(choice: RaceChoice) {
    this.selectedRace.set(choice.race);
    this.selectedSubrace.set(choice.subrace);
    this.raceTraits.set(choice.traits);
  }

  onBackgroundChosen(choice: BackgroundChoice) {
    this.selectedBackground.set(choice.background);
    this.backgroundTraits.set(choice.traits);
  }

  onClassAdded(entry: ClassEntry) {
    this.selectedClasses.update(list => {
      const idx = list.findIndex(e => e.cls.index === entry.cls.index);
      if (idx >= 0) { const next = [...list]; next[idx] = entry; return next; }
      return [...list, entry];
    });
  }

  onClassRemoved(classIndex: string) {
    this.selectedClasses.update(list => list.filter(e => e.cls.index !== classIndex));
  }

  assign(ab: Ability, value: number | null) {
    this.assignments.update(curr => ({ ...curr, [ab]: value }));
  }

  // Switching methods clears the prior picks since they don't carry meaning across methods
  // (e.g. a standard-array 15 isn't a valid point-buy value) — point buy starts every ability
  // at its floor (8) rather than blank, since that's the natural starting point for +/- controls.
  setScoreMethod(method: ScoreMethod) {
    this.scoreMethod.set(method);
    const initial = method === 'pointbuy' ? POINT_BUY_MIN : null;
    this.assignments.set(ABILITIES.reduce(
      (acc, ab) => ({ ...acc, [ab]: initial }), {} as Record<Ability, number | null>,
    ));
  }

  toggleItem(index: string) {
    this.selectedItemIndices.update(s => { const n = new Set(s); if (n.has(index)) n.delete(index); else n.add(index); return n; });
  }

  toggleSpell(event: { requirementKey: string; spellIndex: string }) {
    this.spellChoices.update(current => {
      const selected = current[event.requirementKey] ?? [];
      const next = selected.includes(event.spellIndex)
        ? selected.filter(index => index !== event.spellIndex)
        : [...selected, event.spellIndex];
      return { ...current, [event.requirementKey]: next };
    });
  }

  private migrateLegacySpells(entries: Character['spells']): Record<string, string[]> {
    if (!entries.length) return {};
    const choices: Record<string, string[]> = {};
    const fixed = this.spellResolution();
    const fixedIndexes = new Set([...fixed.known, ...fixed.spellbook, ...fixed.alwaysPrepared]
      .filter(origin => origin.granted)
      .map(origin => origin.spellIndex));
    const catalog = new Map(this.spells().map(spell => [spell.index, spell]));
    const add = (requirement: SpellSelectionRequirement, index: string) => {
      const selected = choices[requirement.key] ?? [];
      if (!selected.includes(index)) choices[requirement.key] = [...selected, index];
    };

    const acquisition = fixed.requirements.filter(requirement => requirement.kind !== 'prepared');
    for (const entry of entries) {
      if (fixedIndexes.has(entry.spellIndex)) continue;
      const spell = catalog.get(entry.spellIndex);
      const candidate = acquisition.find(requirement =>
        requirement.eligibleSpellIndices.includes(entry.spellIndex)
        && (spell?.level === 0 ? requirement.kind === 'cantrips' : requirement.kind !== 'cantrips'));
      if (candidate) add(candidate, entry.spellIndex);
      else {
        const key = 'legacy:unassigned';
        choices[key] = [...(choices[key] ?? []), entry.spellIndex];
      }
    }

    const withAcquisitions = resolveSpellcasting({
      characterLevel: this.level(),
      abilityScores: this.finalScores(),
      spells: this.spells(),
      spellLists: this.spellLists(),
      classes: this.reconciledClasses().map(entry => ({ cls: entry.cls, level: entry.level, subclass: entry.subclass, choices: entry.traits })),
      race: this.selectedRace() ? { race: this.selectedRace()!, subrace: this.selectedSubrace(), choices: this.raceTraits() } : null,
      background: this.selectedBackground() ? { background: this.selectedBackground()!, choices: this.backgroundTraits() } : null,
      spellChoices: choices,
    });
    for (const entry of entries.filter(spell => spell.prepared)) {
      const requirement = withAcquisitions.requirements.find(candidate =>
        candidate.kind === 'prepared' && candidate.eligibleSpellIndices.includes(entry.spellIndex));
      if (requirement) add(requirement, entry.spellIndex);
    }
    return choices;
  }

  async save() {
    if (this.saving()) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.saving.set(true);
    try {
      const draft = this.draftCharacter();
      const existing = this.existingCharacter();
      let result: Character;
      if (!this.characterId()) {
        result = await this.characterService.createDraft(draft, this.activeStep());
      } else if (existing?.creation_status === 'draft') {
        result = await this.characterService.updateDraft(this.characterId()!, draft, this.activeStep());
      } else {
        result = await this.characterService.saveCharacter(draft);
      }
      this.characterId.set(result.id ?? null);
      this.existingCharacter.set(result);
      if (result.creation_status === 'draft' && result.id) {
        localStorage.setItem(ACTIVE_DRAFT_KEY, result.id);
        localStorage.setItem(ACTIVE_DRAFT_STEP_KEY, String(this.activeStep()));
      }
      this.saveStatus.set('saved');
      if (this.statusTimer) clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => this.saveStatus.set('idle'), 2000);
    } finally {
      this.saving.set(false);
    }
  }

  async finish() {
    await this.save();
    const id = this.characterId();
    if (id && this.existingCharacter()?.creation_status === 'draft') {
      const completed = await this.characterService.completeDraft(id);
      this.existingCharacter.set(completed);
      localStorage.removeItem(ACTIVE_DRAFT_KEY);
      localStorage.removeItem(ACTIVE_DRAFT_STEP_KEY);
    }
    this.saved.emit();
  }
  async cancelAndSave() { await this.save(); this.cancelled.emit(); }
  async openSheet() { await this.save(); const id = this.characterId(); if (id) this.viewSheet.emit(id); }
  prev() { this.activeStep.update(s => Math.max(0, s - 1)); }
  next() { this.activeStep.update(s => Math.min(STEPS.length - 1, s + 1)); }
}
