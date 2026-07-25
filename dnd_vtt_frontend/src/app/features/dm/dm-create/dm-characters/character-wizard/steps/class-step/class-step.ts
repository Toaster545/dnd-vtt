import { Component, OnInit, input, output, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { DndClass, TraitGrant, DndItem, DndFeat } from '../../../../../../../core/services/content.service';
import { Ability, ABILITIES } from '../../../../../../../core/models/character.model';

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
        g.type === 'choice' || g.type === 'skill_choice' || g.type === 'weapon_mastery' || g.type === 'ability_choice')
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

  confirmClass() {
    const cls = this.browsingClass();
    if (!cls) return;
    this.classAdded.emit({
      cls,
      level: this.effectiveLevel(),
      subclass: this.draftSubclass(),
      skills: [...this.draftSkills()],
      traits: Object.fromEntries(Object.entries(this.draftTraits()).map(([k, v]) => [k, [...v]])),
    });
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

  toggleDraftSkill(skill: string, cls: DndClass) {
    this.draftSkills.update(skills => {
      if (skills.includes(skill)) return skills.filter(s => s !== skill);
      if (skills.length >= cls.skill_choices.count) return skills;
      return [...skills, skill];
    });
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
        return grant.choose - this.draftSkills().length;
      case 'choice':
      case 'weapon_mastery':
        return grant.choose - (this.draftTraits()[grant.key]?.length ?? 0);
      case 'ability_choice':
        if (grant.allowFeat && this.grantMode(grant) === 'feat') {
          return this.selectedFeat(grant) ? 0 : 1;
        }
        return grant.points - (this.draftTraits()[grant.key]?.length ?? 0);
      default:
        return 0;
    }
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
  }

  // Feat picks live under a companion key so ASI picks and a feat choice never collide in the
  // same traits bucket — only one of the two is ever populated for a given grant.
  private featKey(grant: { key: string }): string {
    return `${grant.key}:feat`;
  }

  grantMode(grant: { key: string }): 'asi' | 'feat' {
    const explicit = this.abilityMode()[grant.key];
    if (explicit) return explicit;
    return (this.draftTraits()[this.featKey(grant)]?.length ?? 0) > 0 ? 'feat' : 'asi';
  }

  selectedFeat(grant: { key: string }): string | null {
    return this.draftTraits()[this.featKey(grant)]?.[0] ?? null;
  }

  setAbilityMode(grant: { key: string }, mode: 'asi' | 'feat') {
    this.abilityMode.update(m => ({ ...m, [grant.key]: mode }));
    this.draftTraits.update(traits => {
      const next = { ...traits };
      if (mode === 'feat') delete next[grant.key];
      else delete next[this.featKey(grant)];
      return next;
    });
  }

  availableFeats(grant: { feats?: string[] }): DndFeat[] {
    const general = this.feats().filter(f => f.category === 'general');
    return grant.feats?.length ? general.filter(f => grant.feats!.includes(f.index)) : general;
  }

  selectFeat(grant: { key: string }, featIndex: string) {
    this.draftTraits.update(traits => ({ ...traits, [grant.key]: [], [this.featKey(grant)]: [featIndex] }));
  }

  isGrantCollapsed(key: string): boolean {
    return this.collapsedGrants().has(key);
  }

  toggleGrantCollapsed(key: string) {
    this.collapsedGrants.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  weaponMasteryOptions(grant: { proficiency: string[] }): DndItem[] {
    return this.items().filter(it =>
      it.type === 'weapon' && it.mastery &&
      grant.proficiency.some(p => it.category.startsWith(p)),
    );
  }

  toggleTrait(grant: TraitGrant & { choose: number; key: string }, option: string, unlocked: boolean) {
    if (!unlocked) return;
    this.draftTraits.update(traits => {
      const current = traits[grant.key] ?? [];
      if (grant.choose === 1) {
        return { ...traits, [grant.key]: current.includes(option) ? [] : [option] };
      }
      if (current.includes(option)) {
        return { ...traits, [grant.key]: current.filter(o => o !== option) };
      }
      if (current.length >= grant.choose) return traits;
      return { ...traits, [grant.key]: [...current, option] };
    });
  }
}
