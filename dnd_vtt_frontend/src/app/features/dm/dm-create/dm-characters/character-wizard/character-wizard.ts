import { Component, inject, signal, computed, effect, output, OnInit, OnDestroy, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContentService, DndRace, DndClass, DndBackground, DndItem, DndSpell, DndFeat, TraitEffect, TraitGrant } from '../../../../../core/services/content.service';
import { ClassChoiceSource, collectTraitEffects } from '../../../../../core/utils/character-effects';
import { isStructuredEquipment, resolveStartingEquipment } from '../../../../../core/utils/starting-equipment';
import { resolveBackgroundSkills } from '../../../../../core/utils/background-skills';
import { CharacterService } from '../../../../../core/services/character.service';
import { CharacterStatsService } from '../../../../../core/services/character-stats.service';
import { Character, Ability, ABILITIES, defaultCharacter, abilityModifier } from '../../../../../core/models/character.model';
import { RaceStepComponent, Subrace, RaceChoice } from './steps/race-step/race-step';
import { ClassStepComponent, ClassEntry } from './steps/class-step/class-step';
import { BackgroundStepComponent, BackgroundChoice } from './steps/background-step/background-step';
import { AbilitiesStepComponent } from './steps/abilities-step/abilities-step';
import { EquipmentStepComponent } from './steps/equipment-step/equipment-step';
import { SpellsStepComponent } from './steps/spells-step/spells-step';
import { DetailsStepComponent } from './steps/details-step/details-step';
import { CharacterPreviewComponent } from './character-preview/character-preview';

const STEPS = ['Race', 'Class', 'Background', 'Abilities', 'Equipment', 'Spells', 'Details'];

@Component({
  selector: 'app-character-wizard',
  imports: [
    FormsModule,
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

  readonly character = input<Character | null>(null);
  readonly saved     = output<void>();
  readonly cancelled = output<void>();

  readonly steps = STEPS;

  activeStep = signal(0);

  races       = signal<DndRace[]>([]);
  classes     = signal<DndClass[]>([]);
  backgrounds = signal<DndBackground[]>([]);
  items       = signal<DndItem[]>([]);
  spells      = signal<DndSpell[]>([]);
  feats       = signal<DndFeat[]>([]);
  loading     = signal(true);

  selectedItemIndices  = signal<Set<string>>(new Set());
  selectedSpellIndices = signal<Set<string>>(new Set());
  classEquipChoices      = signal<Record<string, string[]>>({});
  backgroundEquipChoices = signal<Record<string, string[]>>({});

  characterId        = signal<string | null>(null);
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

  characterName = signal('');
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

  // A feat taken in place of an ASI (or via a pure feat_pick like Fighting Style) can itself
  // carry an ability score increase — most General feats give a flat or player-chosen +1,
  // independent of any `effects` it also carries. Folds that into whichever bonus map is
  // building, using `chosenAbility` (the companion `:feat_ability` pick) when the feat offers
  // more than one eligible ability.
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
    const die = cls.hit_die;
    const conMod = abilityModifier(this.finalScores().constitution);
    const base = Math.max(1, die + conMod + (this.level() - 1) * (Math.floor(die / 2) + 1 + conMod));
    // e.g. Tough: +2 max HP per character level, on top of the normal hit-die progression.
    const perLevelBonus = this.selectedEffects('hp_bonus_per_level').reduce((sum, e) => sum + (e.value ?? 0), 0);
    return base + perLevelBonus * this.level();
  });
  // Scans every chosen class option AND every chosen feat for a structured `effect`/`effects`
  // entry of the given type — e.g. a fighting style's ac_bonus, whether it came from an
  // embedded class option or a feat picked via `ability_choice`/`feat_pick` — so anything that
  // carries one is picked up automatically, without matching on its display name. Conditioned
  // effects (e.g. Defense's ac_bonus "while wearing armor") are deliberately excluded here: they
  // aren't baked into the saved character, they're evaluated live from equipped gear by
  // CharacterStatsService wherever AC is displayed.
  private selectedEffects(type: string): TraitEffect[] {
    return collectTraitEffects(
      this.selectedClasses().map(e => ({ data: e.cls, choices: e.traits })),
      this.feats(),
    ).filter(e => e.type === type && !e.condition);
  }

  armorClass = computed(() => {
    const bonus = this.selectedEffects('ac_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0);
    return 10 + abilityModifier(this.finalScores().dexterity) + bonus;
  });
  speed      = computed(() => this.selectedRace()?.speed ?? 30);
  isEditing  = computed(() => this.characterId() !== null);
  isLastStep = computed(() => this.activeStep() === STEPS.length - 1);

  private skillsRecord = computed(() => {
    const bgSkills = resolveBackgroundSkills(this.selectedBackground(), this.backgroundTraits());
    const classSkills = this.selectedClasses().flatMap(e => e.skills);
    return [...new Set([...bgSkills, ...classSkills])]
      .reduce((acc, s) => ({ ...acc, [s]: true }), {} as Record<string, boolean>);
  });

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

  // The character record as it stands right now, built straight from the wizard's live signals
  // — used both to persist (save(), below) and to drive the live preview pane, so the preview
  // is never more than a re-render behind what's actually on screen (no debounce, no round trip
  // through the backend).
  draftCharacter = computed<Character>(() => {
    const isSingle = this.selectedClasses().length === 1;
    const classes  = isSingle
      ? [{ ...this.selectedClasses()[0], level: this.level() }]
      : this.selectedClasses();
    const primary  = classes[0];

    const itemName = (index: string) => this.items().find(it => it.index === index)?.name ?? index;
    const structuredEquipment = [...this.resolvedClassEquipment().items, ...this.resolvedBackgroundEquipment().items]
      .map(r => ({ itemIndex: r.itemIndex, name: itemName(r.itemIndex), quantity: r.quantity, equipped: false }));
    const freeEquipment = this.items()
      .filter(it => this.selectedItemIndices().has(it.index))
      .map(it => ({ itemIndex: it.index, name: it.name, quantity: 1, equipped: false }));
    const equipment = [...structuredEquipment, ...freeEquipment];

    const spells = this.spells()
      .filter(sp => this.selectedSpellIndices().has(sp.index))
      .map(sp => ({ spellIndex: sp.index, name: sp.name, prepared: false }));
    const hp = this.maxHP();

    return {
      ...defaultCharacter(),
      id: this.characterId() ?? undefined,
      name: this.characterName().trim() || 'Unnamed Character',
      race: this.selectedRace()?.name ?? '',
      subrace: this.selectedSubrace()?.name ?? '',
      race_choices: this.raceTraits(),
      class: primary?.cls.name ?? '',
      subclass: primary?.subclass ?? '',
      level: this.level(),
      classes: classes.map(e => ({ name: e.cls.name, level: e.level, subclass: e.subclass, choices: e.traits, skills: e.skills })),
      background: this.selectedBackground()?.name ?? '',
      background_choices: this.backgroundTraits(),
      class_equipment_choices: this.classEquipChoices(),
      background_equipment_choices: this.backgroundEquipChoices(),
      alignment: this.alignment(),
      ability_scores: { ...this.finalScores() },
      max_hp: hp,
      current_hp: this.currentHp() ?? hp,
      armor_class: this.armorClass(),
      speed: this.speed(),
      skills: this.skillsRecord(),
      equipment,
      currency: this.startingCurrency(),
      spells,
    } as Character;
  });

  private classesForFeats = computed<ClassChoiceSource[]>(() =>
    this.selectedClasses().map(e => ({ data: e.cls, choices: e.traits })),
  );

  previewStats = computed(() => this.statsService.compute(
    this.draftCharacter(), this.primaryClass(), this.selectedRace(),
    this.feats(), this.classesForFeats(), this.items(),
  ));

  private initialized = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.characterName(); this.level(); this.alignment();
      this.selectedRace(); this.selectedSubrace(); this.raceTraits(); this.selectedClasses();
      this.selectedBackground(); this.backgroundTraits();
      this.assignments(); this.selectedItemIndices(); this.selectedSpellIndices();
      this.classEquipChoices(); this.backgroundEquipChoices();
      this.currentHp();

      if (!this.initialized) return;
      this.scheduleSave();
    });
  }

  ngOnDestroy() {
    if (this.saveTimer)  clearTimeout(this.saveTimer);
    if (this.statusTimer) clearTimeout(this.statusTimer);
  }

  async ngOnInit() {
    const [races, classes, backgrounds, items, spells, feats] = await Promise.all([
      this.content.getRaces(),
      this.content.getClasses(),
      this.content.getBackgrounds(),
      this.content.getItems(),
      this.content.getSpells(),
      this.content.getFeats(),
    ]);
    this.races.set(races);
    this.classes.set(classes);
    this.backgrounds.set(backgrounds);
    this.items.set(items);
    this.spells.set(spells);
    this.feats.set(feats);
    this.loading.set(false);

    const existing = this.character();
    if (existing) {
      this.characterId.set(existing.id ?? null);
      this.characterName.set(existing.name);
      this.level.set(existing.level);
      this.alignment.set(existing.alignment);
      this.currentHp.set(existing.current_hp);
      const race = races.find(r => r.name === existing.race) ?? null;
      const bg   = backgrounds.find(b => b.name === existing.background) ?? null;
      this.selectedRace.set(race);
      this.selectedBackground.set(bg);
      if (existing.subrace && race) {
        this.selectedSubrace.set(race.subraces.find(s => s.name === existing.subrace) ?? null);
      }
      this.raceTraits.set(existing.race_choices ?? {});
      this.backgroundTraits.set(existing.background_choices ?? {});
      this.classEquipChoices.set(existing.class_equipment_choices ?? {});
      this.backgroundEquipChoices.set(existing.background_equipment_choices ?? {});
      // Restore classes
      const classEntries = (existing.classes ?? (existing.class ? [{ name: existing.class, level: existing.level, subclass: existing.subclass }] : []))
        .map(c => {
          const cls = classes.find(cl => cl.name === c.name);
          if (!cls) return null;
          return { cls, level: c.level ?? existing.level, subclass: c.subclass ?? '', skills: c.skills ?? [], traits: c.choices ?? {} } as ClassEntry;
        })
        .filter((e): e is ClassEntry => e !== null);
      this.selectedClasses.set(classEntries);
      // Restore ability scores — reverse out both the Background's ability increase and any
      // class-level Ability Score Improvements (both computeds read signals already restored
      // above) to recover the raw values the player originally assigned.
      const scores = existing.ability_scores as Record<Ability, number>;
      if (scores) {
        const bonus = this.bonusScores();
        this.assignments.set(ABILITIES.reduce((acc, ab) => ({
          ...acc, [ab]: scores[ab] ? scores[ab] - bonus[ab] : null,
        }), {} as Record<Ability, number | null>));
      }
    }

    setTimeout(() => { this.initialized = true; }, 0);
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveStatus.set('saving');
    this.saveTimer = setTimeout(() => this.save(), 1500);
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

  toggleItem(index: string) {
    this.selectedItemIndices.update(s => { const n = new Set(s); n.has(index) ? n.delete(index) : n.add(index); return n; });
  }

  toggleSpell(index: string) {
    this.selectedSpellIndices.update(s => { const n = new Set(s); n.has(index) ? n.delete(index) : n.add(index); return n; });
  }

  async save() {
    if (this.saving()) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.saving.set(true);
    try {
      const result = await this.characterService.saveCharacter(this.draftCharacter());
      this.characterId.set(result.id ?? null);
      this.saveStatus.set('saved');
      if (this.statusTimer) clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => this.saveStatus.set('idle'), 2000);
    } finally {
      this.saving.set(false);
    }
  }

  async finish() { await this.save(); this.saved.emit(); }
  async cancelAndSave() { await this.save(); this.cancelled.emit(); }
  prev() { this.activeStep.update(s => Math.max(0, s - 1)); }
  next() { this.activeStep.update(s => Math.min(STEPS.length - 1, s + 1)); }
}
