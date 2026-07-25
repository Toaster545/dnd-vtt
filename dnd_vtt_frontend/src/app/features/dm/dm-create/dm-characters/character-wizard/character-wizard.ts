import { Component, inject, signal, computed, effect, output, OnInit, OnDestroy, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContentService, DndRace, DndClass, DndBackground, DndItem, DndSpell, DndFeat, TraitEffect, TraitGrant } from '../../../../../core/services/content.service';
import { CharacterService } from '../../../../../core/services/character.service';
import { Character, Ability, ABILITIES, defaultCharacter, abilityModifier } from '../../../../../core/models/character.model';
import { RaceStepComponent, Subrace, RaceChoice } from './steps/race-step/race-step';
import { ClassStepComponent, ClassEntry } from './steps/class-step/class-step';
import { BackgroundStepComponent, BackgroundChoice } from './steps/background-step/background-step';
import { AbilitiesStepComponent } from './steps/abilities-step/abilities-step';
import { EquipmentStepComponent } from './steps/equipment-step/equipment-step';
import { SpellsStepComponent } from './steps/spells-step/spells-step';
import { DetailsStepComponent } from './steps/details-step/details-step';

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
  ],
  templateUrl: './character-wizard.html',
  styleUrl: './character-wizard.scss',
})
export class CharacterWizardComponent implements OnInit, OnDestroy {
  private content          = inject(ContentService);
  private characterService = inject(CharacterService);

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

  // Sum of every ability_choice (Ability Score Improvement) point spent across all selected
  // classes and subclasses.
  private classAbilityBonuses = computed(() => {
    const bonus: Record<Ability, number> = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
    for (const entry of this.selectedClasses()) {
      const subclass = entry.cls.subclasses.find(s => s.name === entry.subclass);
      const levels = [...entry.cls.levels, ...(subclass?.levels ?? [])];
      for (const lvl of levels) {
        for (const grant of lvl.grants ?? []) {
          if (grant.type !== 'ability_choice') continue;
          for (const ability of entry.traits[grant.key] ?? []) {
            if (ability in bonus) bonus[ability as Ability] += 1;
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
    return Math.max(1, die + conMod + (this.level() - 1) * (Math.floor(die / 2) + 1 + conMod));
  });
  // Scans every chosen class option for a structured `effect` of the given type — e.g. a
  // fighting style's ac_bonus — so any class/option that carries one is picked up
  // automatically, without matching on the option's display name.
  private selectedEffects(type: string): TraitEffect[] {
    const out: TraitEffect[] = [];
    for (const entry of this.selectedClasses()) {
      const subclass = entry.cls.subclasses.find(s => s.name === entry.subclass);
      const levels = [...entry.cls.levels, ...(subclass?.levels ?? [])];
      for (const lvl of levels) {
        for (const grant of lvl.grants ?? []) {
          if (grant.type !== 'choice') continue;
          const picked = entry.traits[grant.key] ?? [];
          for (const opt of grant.options) {
            if (opt.effect && picked.includes(opt.name) && opt.effect.type === type) out.push(opt.effect);
          }
        }
      }
    }
    return out;
  }

  armorClass = computed(() => {
    const bonus = this.selectedEffects('ac_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0);
    return 10 + abilityModifier(this.finalScores().dexterity) + bonus;
  });
  speed      = computed(() => this.selectedRace()?.speed ?? 30);
  isEditing  = computed(() => this.characterId() !== null);
  isLastStep = computed(() => this.activeStep() === STEPS.length - 1);

  private initialized = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.characterName(); this.level(); this.alignment();
      this.selectedRace(); this.selectedSubrace(); this.raceTraits(); this.selectedClasses();
      this.selectedBackground(); this.backgroundTraits();
      this.assignments(); this.selectedItemIndices(); this.selectedSpellIndices();
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
      const hp        = this.maxHP();
      const isSingle  = this.selectedClasses().length === 1;
      const classes   = isSingle
        ? [{ ...this.selectedClasses()[0], level: this.level() }]
        : this.selectedClasses();
      const primary   = classes[0];
      const equipment = this.items()
        .filter(it => this.selectedItemIndices().has(it.index))
        .map(it => ({ itemIndex: it.index, name: it.name, quantity: 1, equipped: false }));
      const spells = this.spells()
        .filter(sp => this.selectedSpellIndices().has(sp.index))
        .map(sp => ({ spellIndex: sp.index, name: sp.name, prepared: false }));
      const bgSkills = this.selectedBackground()?.skill_proficiencies ?? [];
      const classSkills = this.selectedClasses().flatMap(e => e.skills);
      const skillsRecord = [...new Set([...bgSkills, ...classSkills])]
        .reduce((acc, s) => ({ ...acc, [s]: true }), {} as Record<string, boolean>);

      const result = await this.characterService.saveCharacter({
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
        alignment: this.alignment(),
        ability_scores: { ...this.finalScores() },
        max_hp: hp,
        current_hp: this.currentHp() ?? hp,
        armor_class: this.armorClass(),
        speed: this.speed(),
        skills: skillsRecord,
        equipment,
        spells,
      } as Character);
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
