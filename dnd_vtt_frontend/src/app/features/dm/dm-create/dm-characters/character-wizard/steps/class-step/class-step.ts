import { Component, OnInit, input, output, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { DndClass, TraitGrant, TraitOption, DndItem, DndFeat } from '../../../../../../../core/services/content.service';
import { Ability, ABILITIES } from '../../../../../../../core/models/character.model';
import { resolveProgressiveChoiceLimit } from '../../../../../../../core/utils/progressive-choice';

export interface ClassEntry {
  cls: DndClass;
  level: number;
  subclass: string;
  skills: string[];
  traits: Record<string, string[]>;
}

type ViewMode = 'list' | 'my-classes' | 'detail';

@Component({
  selector: 'app-class-step',
  imports: [FormsModule, UpperCasePipe],
  templateUrl: './class-step.html',
})
export class ClassStepComponent implements OnInit {
  readonly classes           = input.required<DndClass[]>();
  readonly items             = input<DndItem[]>([]);
  readonly feats             = input<DndFeat[]>([]);
  readonly selectedClasses   = input<ClassEntry[]>([]);
  readonly characterLevel    = input.required<number>();
  readonly baseAbilityScores = input.required<Record<Ability, number>>();
  readonly classAdded        = output<ClassEntry>();
  readonly classRemoved      = output<string>();

  readonly abilities = ABILITIES;

  viewMode      = signal<ViewMode>('list');
  browsingClass = signal<DndClass | null>(null);
  fromMyClasses = signal(false);

  draftLevel      = signal(1);
  draftSubclass   = signal('');
  draftSkills     = signal<string[]>([]);
  draftTraits     = signal<Record<string, string[]>>({});
  collapsedGrants = signal<Set<string>>(new Set());
  // Explicit ASI/Feat toggle state per grant key — separate from draftTraits because
  // switching to "Take a Feat" before picking one has no data to derive the mode from.
  abilityMode     = signal<Record<string, 'asi' | 'feat'>>({});

  // When the browsed class is (or would be) the character's only class, its level
  // always tracks the overall character level rather than the draft snapshot —
  // matches how "My Classes" displays it and keeps the features list live.
  effectiveLevel = computed(() => {
    const cls = this.browsingClass();
    if (!cls) return this.draftLevel();
    const isMulticlass = this.selectedClasses().some(e => e.cls.index !== cls.index);
    return isMulticlass ? this.draftLevel() : this.characterLevel();
  });

  ngOnInit() {
    if (this.selectedClasses().length > 0) this.viewMode.set('my-classes');
  }

  openFromList(cls: DndClass) {
    this.fromMyClasses.set(false);
    this.openDetail(cls);
  }

  openFromMyClasses(entry: ClassEntry) {
    this.fromMyClasses.set(true);
    this.openDetail(entry.cls);
  }

  // All collapsible (choice-shaped) grant keys for a class, across every level and every
  // subclass — used to start the Class Traits section fully collapsed when a class is opened.
  private grantKeys(cls: DndClass): string[] {
    const fromLevels = (levels: { grants?: TraitGrant[] }[]) => levels.flatMap(l => (l.grants ?? [])
      .filter((g): g is Extract<TraitGrant, { key: string }> =>
        g.type === 'choice' || g.type === 'skill_choice' || g.type === 'weapon_mastery' || g.type === 'ability_choice' || g.type === 'feat_pick')
      .map(g => g.key));
    return [...fromLevels(cls.levels), ...cls.subclasses.flatMap(s => fromLevels(s.levels))];
  }

  private openDetail(cls: DndClass) {
    const existing  = this.selectedClasses().find(e => e.cls.index === cls.index);
    const remaining = this.remainingLevels(cls);
    this.draftLevel.set(existing?.level ?? remaining);
    this.draftSubclass.set(existing?.subclass ?? '');
    this.draftSkills.set(existing?.skills ? [...existing.skills] : []);
    this.draftTraits.set(existing?.traits ? { ...existing.traits } : {});
    this.abilityMode.set({});
    this.collapsedGrants.set(new Set([...this.grantKeys(cls), 'subclass']));
    this.browsingClass.set(cls);
    this.viewMode.set('detail');
  }

  back() {
    this.browsingClass.set(null);
    const target: ViewMode = this.fromMyClasses() || this.selectedClasses().length > 0
      ? 'my-classes' : 'list';
    this.viewMode.set(target);
  }

  goToList() { this.viewMode.set('list'); }

  // Pushes the current draft up to the parent (which autosaves the character on any change),
  // without leaving the detail view — called after every user edit below so picks are never
  // lost to a missed click, not just when the class is first opened (that initial draft
  // population shouldn't itself count as "adding" a class the player is merely previewing).
  private syncDraft() {
    const cls = this.browsingClass();
    if (!cls) return;
    this.classAdded.emit({
      cls,
      level: this.effectiveLevel(),
      subclass: this.draftSubclass(),
      skills: [...this.draftSkills()],
      traits: Object.fromEntries(Object.entries(this.draftTraits()).map(([k, v]) => [k, [...v]])),
    });
  }

  confirmClass() {
    if (!this.browsingClass()) return;
    this.syncDraft();
    this.browsingClass.set(null);
    this.viewMode.set('my-classes');
  }

  removeCurrentClass() {
    const cls = this.browsingClass();
    if (!cls) return;
    this.classRemoved.emit(cls.index);
    this.browsingClass.set(null);
    this.viewMode.set(this.selectedClasses().length > 1 ? 'my-classes' : 'list');
  }

  isAdded(cls: DndClass): boolean {
    return this.selectedClasses().some(e => e.cls.index === cls.index);
  }

  entryFor(cls: DndClass): ClassEntry | undefined {
    return this.selectedClasses().find(e => e.cls.index === cls.index);
  }

  isCurrentAdded(): boolean {
    const cls = this.browsingClass();
    return !!cls && this.isAdded(cls);
  }

  remainingLevels(cls: DndClass): number {
    const othersTotal = this.selectedClasses()
      .filter(e => e.cls.index !== cls.index)
      .reduce((sum, e) => sum + e.level, 0);
    return Math.max(1, this.characterLevel() - othersTotal);
  }

  canPickSubclass(cls: DndClass): boolean {
    return this.effectiveLevel() >= cls.subclass_level;
  }

  skillOptions(grant: Extract<TraitGrant, { type: 'skill_choice' }>, cls: DndClass): string[] {
    return grant.skills ?? cls.skill_choices.from;
  }

  skillSelections(grant: Extract<TraitGrant, { type: 'skill_choice' }>): string[] {
    return grant.key === 'skills' ? this.draftSkills() : (this.draftTraits()[grant.key] ?? []);
  }

  skillTakenElsewhere(grant: Extract<TraitGrant, { type: 'skill_choice' }>, skill: string): boolean {
    const initial = grant.key === 'skills' ? [] : this.draftSkills();
    const cls = this.browsingClass();
    const skillKeys = new Set([
      ...(cls?.levels ?? []),
      ...(cls?.subclasses.flatMap(subclass => subclass.levels) ?? []),
    ].flatMap(level => (level.grants ?? [])
      .filter((candidate): candidate is Extract<TraitGrant, { type: 'skill_choice' }> => candidate.type === 'skill_choice')
      .map(candidate => candidate.key)));
    const later = Object.entries(this.draftTraits())
      .filter(([key]) => key !== grant.key && skillKeys.has(key))
      .flatMap(([, picks]) => picks);
    return [...initial, ...later].includes(skill);
  }

  toggleDraftSkill(grant: Extract<TraitGrant, { type: 'skill_choice' }>, skill: string) {
    const selections = this.skillSelections(grant);
    if (!selections.includes(skill) && (selections.length >= grant.choose || this.skillTakenElsewhere(grant, skill))) return;

    const next = selections.includes(skill)
      ? selections.filter(selected => selected !== skill)
      : [...selections, skill];
    if (grant.key === 'skills') this.draftSkills.set(next);
    else this.draftTraits.update(traits => ({ ...traits, [grant.key]: next }));
    this.syncDraft();
  }

  // Level (multiclass only) and subclass are set directly from template bindings — routed
  // through methods (rather than `draftLevel.set(...)` inline) so they can also autosave.
  setDraftLevel(level: number) {
    this.draftLevel.set(level);
    this.syncDraft();
  }

  selectSubclass(name: string) {
    this.draftSubclass.set(name);
    this.syncDraft();
  }

  visibleLevels(cls: DndClass): number[] {
    const subLevels = new Set(this.chosenSubclass(cls)?.levels.map(l => l.level) ?? []);
    return cls.levels
      .filter(l => l.features.length > 0 || (l.grants?.length ?? 0) > 0 || subLevels.has(l.level))
      .map(l => l.level);
  }

  private chosenSubclass(cls: DndClass) {
    return cls.subclasses.find(s => s.name === this.draftSubclass());
  }

  // A single render-ready list for a level: the base class's own grants (its structured
  // `grants` if the class has been restructured, otherwise each legacy feature string promoted
  // to a plain feature grant) plus the chosen subclass's grants/features for that level
  // appended and tagged — so subclass traits go through the exact same choice/collapse/
  // indicator UI as base class traits instead of a separate plain-text block.
  levelGrants(cls: DndClass, level: number): { grant: TraitGrant; fromSubclass: boolean }[] {
    const toGrants = (lvl: { grants?: TraitGrant[]; features: string[] } | undefined): TraitGrant[] =>
      lvl?.grants?.length ? lvl.grants : (lvl?.features ?? []).map(name => ({ type: 'feature', name }) as TraitGrant);

    const base = toGrants(cls.levels.find(l => l.level === level))
      .filter(g => !this.isSubclassPlaceholder(cls, level, g))
      .map(grant => ({ grant, fromSubclass: false }));

    const subGrants = toGrants(this.chosenSubclass(cls)?.levels.find(l => l.level === level))
      .map(grant => ({ grant, fromSubclass: true }));

    return [...base, ...subGrants];
  }

  // The base class sometimes has a generic "...Feature" placeholder line at levels where the
  // subclass supplies the real feature (e.g. "Martial Archetype Feature") — hide it once the
  // subclass's actual feature is available to show instead, so it isn't shown twice.
  private isSubclassPlaceholder(cls: DndClass, level: number, grant: TraitGrant): boolean {
    if (grant.type !== 'feature' || !/feature$/i.test(grant.name)) return false;
    const sub = this.chosenSubclass(cls)?.levels.find(l => l.level === level);
    return !!sub && ((sub.grants?.length ?? 0) > 0 || sub.features.length > 0);
  }

  isLevelUnlocked(level: number): boolean {
    return level <= this.effectiveLevel();
  }

  traitSelected(grant: TraitGrant & { key: string }, option: string): boolean {
    return this.draftTraits()[grant.key]?.includes(option) ?? false;
  }

  // Unified "how many picks remain" for any choice-shaped grant, so the collapsed
  // header and the option list share one source of truth for the "needs a choice" state.
  choicesLeft(grant: TraitGrant): number {
    switch (grant.type) {
      case 'skill_choice':
        return Math.max(0, grant.choose - this.skillSelections(grant).length);
      case 'choice':
        return Math.max(0, this.choiceLimit(grant) - (this.draftTraits()[grant.key]?.length ?? 0));
      case 'weapon_mastery':
      case 'feat_pick':
        return Math.max(0, grant.choose - (this.draftTraits()[grant.key]?.length ?? 0));
      case 'ability_choice':
        if (grant.allowFeat && this.grantMode(grant) === 'feat') {
          const feat = this.pickedFeatFor(grant);
          if (!feat) return 1;
          const needsAbilityPick = (feat.abilityIncrease?.abilities.length ?? 0) > 1 && !this.selectedFeatAbility(grant);
          return needsAbilityPick ? 1 : 0;
        }
        return grant.points - (this.draftTraits()[grant.key]?.length ?? 0);
      default:
        return 0;
    }
  }

  // Most choice grants have a fixed size. Progressive pools use the greatest configured total
  // at or below the current class level (falling back to the ordinary `choose` value).
  choiceLimit(grant: Extract<TraitGrant, { type: 'choice' }>): number {
    return resolveProgressiveChoiceLimit(grant.choose, grant.chooseByLevel, this.effectiveLevel());
  }

  availableTraitOptions(grant: Extract<TraitGrant, { type: 'choice' }>): TraitOption[] {
    const allSelections = new Set(Object.values(this.draftTraits()).flat());
    return grant.options.filter(option => {
      if (this.traitSelected(grant, option.name)) return true;
      const prerequisite = option.prerequisite;
      if (!prerequisite) return true;
      if (prerequisite.level && this.effectiveLevel() < prerequisite.level) return false;
      return (prerequisite.selections ?? []).every(selection => allSelections.has(selection));
    });
  }

  abilityAllocated(grant: Extract<TraitGrant, { type: 'ability_choice' }>, ability: Ability): number {
    return (this.draftTraits()[grant.key] ?? []).filter(a => a === ability).length;
  }

  // Sum of every point already spent on this ability, across every ability_choice grant on
  // every selected class (the currently browsed class's live draft plus other classes' saved
  // picks) — used to enforce the 20 cap regardless of which specific grant contributes it.
  private totalAssigned(ability: Ability): number {
    const keysFor = (cls: DndClass) => cls.levels.flatMap(l => (l.grants ?? [])
      .filter((g): g is Extract<TraitGrant, { type: 'ability_choice' }> => g.type === 'ability_choice')
      .map(g => g.key));

    let total = 0;
    const browsing = this.browsingClass();
    for (const entry of this.selectedClasses()) {
      const isBrowsing = browsing?.index === entry.cls.index;
      const traits = isBrowsing ? this.draftTraits() : entry.traits;
      for (const key of keysFor(entry.cls)) {
        total += (traits[key] ?? []).filter(a => a === ability).length;
      }
    }
    // Browsing a class not yet added (e.g. previewing before confirming the first class).
    if (browsing && !this.selectedClasses().some(e => e.cls.index === browsing.index)) {
      for (const key of keysFor(browsing)) {
        total += (this.draftTraits()[key] ?? []).filter(a => a === ability).length;
      }
    }
    return total;
  }

  canIncrementAbility(grant: Extract<TraitGrant, { type: 'ability_choice' }>, ability: Ability): boolean {
    if (this.choicesLeft(grant) <= 0) return false;
    if (this.abilityAllocated(grant, ability) >= 2) return false;
    const base = this.baseAbilityScores()[ability] ?? 10;
    return base + this.totalAssigned(ability) < 20;
  }

  incrementAbility(grant: Extract<TraitGrant, { type: 'ability_choice' }>, ability: Ability) {
    if (!this.canIncrementAbility(grant, ability)) return;
    this.draftTraits.update(traits => ({ ...traits, [grant.key]: [...(traits[grant.key] ?? []), ability] }));
    this.syncDraft();
  }

  decrementAbility(grant: Extract<TraitGrant, { type: 'ability_choice' }>, ability: Ability) {
    this.draftTraits.update(traits => {
      const current = traits[grant.key] ?? [];
      const idx = current.lastIndexOf(ability);
      if (idx === -1) return traits;
      const next = [...current];
      next.splice(idx, 1);
      return { ...traits, [grant.key]: next };
    });
    this.syncDraft();
  }

  // Feat picks live under a companion key so ASI picks and a feat choice never collide in the
  // same traits bucket — only one of the two is ever populated for a given grant. A second
  // companion key holds which ability got the +1 when the chosen feat offers more than one.
  private featKey(grant: { key: string }): string {
    return `${grant.key}:feat`;
  }

  private featAbilityKey(grant: { key: string }): string {
    return `${grant.key}:feat_ability`;
  }

  grantMode(grant: { key: string }): 'asi' | 'feat' {
    const explicit = this.abilityMode()[grant.key];
    if (explicit) return explicit;
    return (this.draftTraits()[this.featKey(grant)]?.length ?? 0) > 0 ? 'feat' : 'asi';
  }

  selectedFeat(grant: { key: string }): string | null {
    return this.draftTraits()[this.featKey(grant)]?.[0] ?? null;
  }

  pickedFeatFor(grant: { key: string }): DndFeat | null {
    const index = this.selectedFeat(grant);
    return index ? this.feats().find(f => f.index === index) ?? null : null;
  }

  selectedFeatAbility(grant: { key: string }): Ability | null {
    return (this.draftTraits()[this.featAbilityKey(grant)]?.[0] as Ability) ?? null;
  }

  selectFeatAbility(grant: { key: string }, ability: string) {
    this.draftTraits.update(traits => ({ ...traits, [this.featAbilityKey(grant)]: [ability] }));
    this.syncDraft();
  }

  setAbilityMode(grant: { key: string }, mode: 'asi' | 'feat') {
    this.abilityMode.update(m => ({ ...m, [grant.key]: mode }));
    this.draftTraits.update(traits => {
      const next = { ...traits };
      if (mode === 'feat') delete next[grant.key];
      else { delete next[this.featKey(grant)]; delete next[this.featAbilityKey(grant)]; }
      return next;
    });
    this.syncDraft();
  }

  // "For which you qualify" — non-qualifying feats are excluded outright rather than shown
  // disabled. The class ASI-or-feat feature doesn't name a category, so per the 2024 rules any
  // category is eligible here (not just General) as long as its prerequisite is met — e.g. a
  // Fighter who already has the Fighting Style feature qualifies for a Fighting Style feat too.
  availableFeats(grant: { key: string; feats?: string[] }): DndFeat[] {
    const taken = this.alreadyTakenElsewhere(grant.key);
    const pool = this.feats().filter(f => this.qualifiesForFeat(f) && (f.repeatable || !taken.has(f.index)));
    return grant.feats?.length ? pool.filter(f => grant.feats!.includes(f.index)) : pool;
  }

  selectFeat(grant: { key: string }, featIndex: string) {
    this.draftTraits.update(traits => {
      const next = { ...traits, [grant.key]: [], [this.featKey(grant)]: [featIndex] };
      delete next[this.featAbilityKey(grant)];
      return next;
    });
    this.syncDraft();
  }

  availableFeatPicks(grant: { key: string; category: 'origin' | 'general' | 'fighting_style' | 'epic'; feats?: string[]; excludeKey?: string }): DndFeat[] {
    const taken = this.alreadyTakenElsewhere(grant.key);
    let pool = this.feats().filter(f =>
      f.category === grant.category && this.qualifiesForFeat(f) && (f.repeatable || !taken.has(f.index)));
    if (grant.feats?.length) pool = pool.filter(f => grant.feats!.includes(f.index));
    if (grant.excludeKey) {
      const excluded = new Set(this.draftTraits()[grant.excludeKey] ?? []);
      pool = pool.filter(f => !excluded.has(f.index));
    }
    return pool;
  }

  private armorTraining(): string[] {
    return [
      ...this.selectedClasses().flatMap(e => e.cls.armor_training),
      ...(this.browsingClass()?.armor_training ?? []),
    ];
  }

  // A feat can grant armor proficiency directly (e.g. Heavily Armored →
  // `effects: [{ type: 'armor_proficiency', tags: ['heavy'] }]`), same as a class's
  // `armor_training` list — both count toward qualifying for a later armor-gated prerequisite.
  private armorProficiencyTagsFromFeats(): string[] {
    return this.allFeatPickEntries()
      .map(e => this.feats().find(f => f.index === e.featIndex))
      .filter((f): f is DndFeat => !!f)
      .flatMap(f => f.effects ?? [])
      .filter(eff => eff.type === 'armor_proficiency')
      .flatMap(eff => eff.tags ?? []);
  }

  private hasArmorProficiency(kind: 'light' | 'medium' | 'heavy' | 'shield'): boolean {
    const fromClasses = this.armorTraining().some(t => {
      const lower = t.toLowerCase();
      return lower.includes('all armor') || lower.includes(kind);
    });
    return fromClasses || this.armorProficiencyTagsFromFeats().includes(kind);
  }

  // Every feat currently picked via any `ability_choice`/`feat_pick` grant on any selected
  // class (plus the class currently being browsed), tagged with which grant chose it — the
  // shared basis for both armor-proficiency-from-feats and repeatable-feat gating below.
  private allFeatPickEntries(): { grantKey: string; featIndex: string }[] {
    const out: { grantKey: string; featIndex: string }[] = [];
    const scan = (cls: DndClass, traits: Record<string, string[]>) => {
      const levels = [...cls.levels, ...cls.subclasses.flatMap(s => s.levels)];
      for (const grant of levels.flatMap(l => l.grants ?? [])) {
        if (grant.type === 'ability_choice') {
          const featIndex = traits[`${grant.key}:feat`]?.[0];
          if (featIndex) out.push({ grantKey: grant.key, featIndex });
        } else if (grant.type === 'feat_pick') {
          for (const featIndex of traits[grant.key] ?? []) out.push({ grantKey: grant.key, featIndex });
        }
      }
    };
    const browsing = this.browsingClass();
    for (const entry of this.selectedClasses()) {
      scan(entry.cls, browsing?.index === entry.cls.index ? this.draftTraits() : entry.traits);
    }
    if (browsing && !this.selectedClasses().some(e => e.cls.index === browsing.index)) {
      scan(browsing, this.draftTraits());
    }
    return out;
  }

  // Feats already taken via some OTHER grant than the one currently being filled — used to
  // exclude non-repeatable feats from a picker, without hiding a feat the picker's own grant
  // already selected (which would break deselecting it).
  private alreadyTakenElsewhere(excludeGrantKey: string): Set<string> {
    return new Set(
      this.allFeatPickEntries().filter(e => e.grantKey !== excludeGrantKey).map(e => e.featIndex),
    );
  }

  private hasSpellcasting(): boolean {
    return this.selectedClasses().some(e => !!e.cls.spellcasting_ability) || !!this.browsingClass()?.spellcasting_ability;
  }

  private currentClassIndices(): Set<string> {
    const browsing = this.browsingClass();
    return new Set([
      ...this.selectedClasses().map(e => e.cls.index),
      ...(browsing ? [browsing.index] : []),
    ]);
  }

  // Whether the character already has a named class feature (e.g. "Fighting Style") — used to
  // gate feats whose prerequisite is having that feature, not an ability score/armor/spell check.
  private hasFeature(name: string): boolean {
    const grantedBy = (cls: DndClass, level: number) => cls.levels.some(l => l.level <= level && l.features.includes(name));
    const browsing = this.browsingClass();
    if (browsing && grantedBy(browsing, this.effectiveLevel())) return true;
    return this.selectedClasses().some(e => e.cls.index !== browsing?.index && grantedBy(e.cls, e.level));
  }

  // "...for which you qualify" — per the 2024 rules, a feat choice that doesn't name a specific
  // category (as the class ASI-or-feat feature doesn't) can be filled from ANY category, not
  // just General, so every prerequisite is actively checked here including `level` (against
  // total character level) and `feature` (e.g. Fighting Style feats require already having the
  // Fighting Style class feature).
  qualifiesForFeat(feat: DndFeat): boolean {
    const p = feat.prerequisite;
    if (!p) return true;
    if (p.level && this.characterLevel() < p.level) return false;
    if (p.abilities?.length) {
      const min = p.min ?? 13;
      const scores = this.baseAbilityScores();
      if (!p.abilities.some(a => (scores[a as Ability] ?? 10) >= min)) return false;
    }
    if (p.armorProficiency && !this.hasArmorProficiency(p.armorProficiency)) return false;
    if (p.spellcasting && !this.hasSpellcasting()) return false;
    if (p.classes?.length && !p.classes.some(c => this.currentClassIndices().has(c))) return false;
    if (p.feature && !this.hasFeature(p.feature)) return false;
    return true;
  }

  isGrantCollapsed(key: string): boolean {
    return this.collapsedGrants().has(key);
  }

  toggleGrantCollapsed(key: string) {
    this.collapsedGrants.update(set => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Weapons already mastered via some OTHER weapon_mastery grant (e.g. the level 1 pick of 3,
  // when filling the level 4 "4th weapon" grant) — a class's weapon mastery count grows across
  // several levels (see fighter.json), each its own keyed grant, so without this a weapon picked
  // at an earlier level would still show up as pickable again at a later one.
  private weaponMasteryPicksElsewhere(excludeGrantKey: string): Set<string> {
    const out = new Set<string>();
    const scan = (cls: DndClass, traits: Record<string, string[]>) => {
      const levels = [...cls.levels, ...cls.subclasses.flatMap(s => s.levels)];
      for (const grant of levels.flatMap(l => l.grants ?? [])) {
        if (grant.type === 'weapon_mastery' && grant.key !== excludeGrantKey) {
          for (const weapon of traits[grant.key] ?? []) out.add(weapon);
        }
      }
    };
    const browsing = this.browsingClass();
    for (const entry of this.selectedClasses()) {
      scan(entry.cls, browsing?.index === entry.cls.index ? this.draftTraits() : entry.traits);
    }
    if (browsing && !this.selectedClasses().some(e => e.cls.index === browsing.index)) {
      scan(browsing, this.draftTraits());
    }
    return out;
  }

  weaponMasteryOptions(grant: { key: string; proficiency: string[] }): DndItem[] {
    const excluded = this.weaponMasteryPicksElsewhere(grant.key);
    return this.items().filter(it =>
      it.type === 'weapon' && it.mastery &&
      grant.proficiency.some(p => it.category.startsWith(p)) &&
      !excluded.has(it.name),
    );
  }

  toggleTrait(grant: TraitGrant & { choose: number; key: string }, option: string, unlocked: boolean) {
    if (!unlocked) return;
    this.draftTraits.update(traits => {
      const current = traits[grant.key] ?? [];
      const limit = grant.type === 'choice' ? this.choiceLimit(grant) : grant.choose;
      if (limit === 1) {
        return { ...traits, [grant.key]: current.includes(option) ? [] : [option] };
      }
      if (current.includes(option)) {
        return { ...traits, [grant.key]: current.filter(o => o !== option) };
      }
      if (current.length >= limit) return traits;
      return { ...traits, [grant.key]: [...current, option] };
    });
    this.syncDraft();
  }
}
