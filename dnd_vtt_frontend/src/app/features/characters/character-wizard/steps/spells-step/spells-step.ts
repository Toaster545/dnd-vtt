import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import type { DndSpell } from '../../../../../core/services/content.service';
import type {
  ResolvedSpellOrigin,
  ResolvedSpellcastingSource,
  SpellcastingResolution,
  SpellSelectionRequirement,
} from '../../../../../core/utils/spellcasting';

interface SpellSourceGroup {
  key: string;
  name: string;
  source: ResolvedSpellcastingSource | null;
  requirements: SpellSelectionRequirement[];
  granted: ResolvedSpellOrigin[];
}

interface SpellLevelGroup {
  level: number;
  label: string;
  spells: DndSpell[];
}

type RangeFilter = '' | 'self' | 'touch' | '30' | '60' | '120' | 'long' | 'special';
type CastingTimeFilter = '' | 'action' | 'bonus_action' | 'reaction' | 'longer';
type BooleanFilter = '' | 'yes' | 'no';

interface SpellFilters {
  level: number | null;
  school: string;
  range: RangeFilter;
  castingTime: CastingTimeFilter;
  concentration: BooleanFilter;
  ritual: BooleanFilter;
}

const EMPTY_FILTERS: SpellFilters = {
  level: null,
  school: '',
  range: '',
  castingTime: '',
  concentration: '',
  ritual: '',
};

@Component({
  selector: 'app-spells-step',
  imports: [NgTemplateOutlet],
  templateUrl: './spells-step.html',
})
export class SpellsStepComponent {
  readonly spells      = input.required<DndSpell[]>();
  readonly resolution  = input.required<SpellcastingResolution>();
  readonly spellToggled = output<{ requirementKey: string; spellIndex: string }>();

  readonly globalFilterKey = 'all-spells';
  readonly search = signal('');
  readonly openFilterScope = signal<string | null>(null);
  readonly filtersByScope = signal<Record<string, SpellFilters>>({});
  readonly collapsedGroups = signal<Set<string>>(new Set());
  readonly collapsedRequirements = signal<Set<string>>(new Set());

  private readonly previousRequirementComplete = new Map<string, boolean>();
  private readonly autoCollapsedRequirements = new Set<string>();

  private readonly spellByIndex = computed(() =>
    new Map(this.spells().map(spell => [spell.index, spell])));

  readonly groups = computed<SpellSourceGroup[]>(() => {
    const result = this.resolution();
    const sourceKeys = new Set([
      ...result.sources.map(source => source.key),
      ...result.requirements.map(requirement => requirement.sourceKey),
    ]);
    return [...sourceKeys].map(key => {
      const source = result.sources.find(candidate => candidate.key === key) ?? null;
      const requirements = result.requirements.filter(requirement => requirement.sourceKey === key);
      const granted = [...result.known, ...result.alwaysPrepared]
        .filter(origin => origin.sourceKey === key && origin.granted);
      return {
        key,
        name: source?.name ?? requirements[0]?.sourceName ?? 'Spells',
        source,
        requirements,
        granted,
      };
    }).filter(group => group.requirements.length > 0 || group.granted.length > 0);
  });

  readonly globalErrors = computed(() =>
    this.resolution().validationErrors.filter(error => !error.requirementKey));

  readonly availableLevels = computed(() => {
    const eligible = new Set(this.resolution().requirements.flatMap(requirement => requirement.eligibleSpellIndices));
    return [...new Set(this.spells()
      .filter(spell => eligible.has(spell.index))
      .map(spell => spell.level))].sort((a, b) => a - b);
  });

  readonly availableSchools = computed(() => {
    const eligible = new Set(this.resolution().requirements.flatMap(requirement => requirement.eligibleSpellIndices));
    return [...new Set(this.spells()
      .filter(spell => eligible.has(spell.index))
      .map(spell => spell.school))].sort((a, b) => a.localeCompare(b));
  });

  constructor() {
    effect(() => {
      const requirements = this.resolution().requirements;
      untracked(() => {
        const activeKeys = new Set(requirements.map(requirement => requirement.key));
        for (const requirement of requirements) {
          const complete = requirement.remaining === 0 && requirement.errors.length === 0;
          const previous = this.previousRequirementComplete.get(requirement.key);
          if (previous === false && complete && !this.autoCollapsedRequirements.has(requirement.key)) {
            this.collapsedRequirements.update(keys => new Set(keys).add(requirement.key));
            this.autoCollapsedRequirements.add(requirement.key);
          } else if (previous === true && !complete) {
            this.collapsedRequirements.update(keys => {
              const next = new Set(keys);
              next.delete(requirement.key);
              return next;
            });
          }
          this.previousRequirementComplete.set(requirement.key, complete);
        }
        for (const key of this.previousRequirementComplete.keys()) {
          if (!activeKeys.has(key)) this.previousRequirementComplete.delete(key);
        }
      });
    });
  }

  visibleSpells(requirement: SpellSelectionRequirement): DndSpell[] {
    const query = this.search().trim().toLowerCase();
    const indexes = new Set([
      ...requirement.eligibleSpellIndices,
      ...requirement.selectedSpellIndices,
    ]);
    return [...indexes]
      .map(index => this.spellByIndex().get(index))
      .filter((spell): spell is DndSpell => !!spell)
      .filter(spell => requirement.invalidSelectedSpellIndices.includes(spell.index)
        || this.matchesSearch(spell, query)
          && this.matchesFilters(spell, this.filterState(this.globalFilterKey))
          && this.matchesFilters(spell, this.filterState(requirement.key)))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  visibleSpellGroups(requirement: SpellSelectionRequirement): SpellLevelGroup[] {
    const byLevel = new Map<number, DndSpell[]>();
    for (const spell of this.visibleSpells(requirement)) {
      byLevel.set(spell.level, [...(byLevel.get(spell.level) ?? []), spell]);
    }
    return [...byLevel.entries()].map(([level, levelSpells]) => ({
      level,
      label: level === 0 ? 'Cantrips' : `Level ${level} Spells`,
      spells: levelSpells,
    }));
  }

  grantedSpell(origin: ResolvedSpellOrigin): DndSpell | null {
    return this.spellByIndex().get(origin.spellIndex) ?? null;
  }

  isSelected(requirement: SpellSelectionRequirement, index: string): boolean {
    return requirement.selectedSpellIndices.includes(index);
  }

  isInvalid(requirement: SpellSelectionRequirement, index: string): boolean {
    return requirement.invalidSelectedSpellIndices.includes(index);
  }

  isDuplicateConflict(requirement: SpellSelectionRequirement, index: string): boolean {
    return requirement.errors.some(error => error.code === 'duplicate_spell' && error.spellIndex === index);
  }

  isUnavailable(requirement: SpellSelectionRequirement, index: string): boolean {
    return !this.isSelected(requirement, index) && requirement.unavailableSpellIndices.includes(index);
  }

  unavailableSource(requirement: SpellSelectionRequirement, index: string): string {
    return requirement.unavailableSpellSources[index] ?? 'another spell source';
  }

  canToggle(requirement: SpellSelectionRequirement, index: string): boolean {
    return this.isSelected(requirement, index)
      || !this.isUnavailable(requirement, index)
        && requirement.validSelectedSpellIndices.length < requirement.required;
  }

  toggle(requirement: SpellSelectionRequirement, index: string): void {
    if (!this.canToggle(requirement, index)) return;
    this.spellToggled.emit({ requirementKey: requirement.key, spellIndex: index });
  }

  isGroupCollapsed(key: string): boolean {
    return this.collapsedGroups().has(key);
  }

  toggleGroup(key: string): void {
    this.collapsedGroups.update(keys => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  isRequirementCollapsed(key: string): boolean {
    return this.collapsedRequirements().has(key);
  }

  toggleRequirement(key: string): void {
    this.collapsedRequirements.update(keys => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  groupHasOutstanding(group: SpellSourceGroup): boolean {
    return group.requirements.some(requirement => requirement.remaining > 0);
  }

  filterState(scope: string): SpellFilters {
    return this.filtersByScope()[scope] ?? EMPTY_FILTERS;
  }

  activeFilterCount(scope: string): number {
    const filters = this.filterState(scope);
    return [
      filters.level !== null,
      !!filters.school,
      !!filters.range,
      !!filters.castingTime,
      !!filters.concentration,
      !!filters.ritual,
    ].filter(Boolean).length;
  }

  toggleFilters(scope: string): void {
    this.openFilterScope.update(open => open === scope ? null : scope);
  }

  closeFilters(): void {
    this.openFilterScope.set(null);
  }

  availableLevelsFor(scope: string): number[] {
    const requirement = this.resolution().requirements.find(candidate => candidate.key === scope);
    if (!requirement) return this.availableLevels();
    const eligible = new Set(requirement.eligibleSpellIndices);
    return [...new Set(this.spells().filter(spell => eligible.has(spell.index)).map(spell => spell.level))]
      .sort((a, b) => a - b);
  }

  availableSchoolsFor(scope: string): string[] {
    const requirement = this.resolution().requirements.find(candidate => candidate.key === scope);
    if (!requirement) return this.availableSchools();
    const eligible = new Set(requirement.eligibleSpellIndices);
    return [...new Set(this.spells().filter(spell => eligible.has(spell.index)).map(spell => spell.school))]
      .sort((a, b) => a.localeCompare(b));
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  setLevelFilter(scope: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateFilters(scope, { level: value === '' ? null : Number(value) });
  }

  setSchoolFilter(scope: string, event: Event): void {
    this.updateFilters(scope, { school: (event.target as HTMLSelectElement).value });
  }

  setRangeFilter(scope: string, event: Event): void {
    this.updateFilters(scope, { range: (event.target as HTMLSelectElement).value as RangeFilter });
  }

  setCastingTimeFilter(scope: string, event: Event): void {
    this.updateFilters(scope, { castingTime: (event.target as HTMLSelectElement).value as CastingTimeFilter });
  }

  setConcentrationFilter(scope: string, event: Event): void {
    this.updateFilters(scope, { concentration: (event.target as HTMLSelectElement).value as BooleanFilter });
  }

  setRitualFilter(scope: string, event: Event): void {
    this.updateFilters(scope, { ritual: (event.target as HTMLSelectElement).value as BooleanFilter });
  }

  resetFilters(scope: string): void {
    this.filtersByScope.update(current => ({ ...current, [scope]: { ...EMPTY_FILTERS } }));
  }

  levelLabel(level: number): string {
    return level === 0 ? 'Cantrip' : `Level ${level}`;
  }

  private matchesSearch(spell: DndSpell, query: string): boolean {
    return !query
      || spell.name.toLowerCase().includes(query)
      || spell.school.toLowerCase().includes(query)
      || String(spell.level).includes(query);
  }

  private updateFilters(scope: string, patch: Partial<SpellFilters>): void {
    this.filtersByScope.update(current => ({
      ...current,
      [scope]: { ...(current[scope] ?? EMPTY_FILTERS), ...patch },
    }));
  }

  private matchesFilters(spell: DndSpell, filters: SpellFilters): boolean {
    if (filters.level !== null && spell.level !== filters.level) return false;
    if (filters.school && spell.school !== filters.school) return false;
    if (filters.castingTime && this.castingTimeCategory(spell.casting_time) !== filters.castingTime) return false;
    if (filters.concentration && spell.concentration !== (filters.concentration === 'yes')) return false;
    if (filters.ritual && spell.ritual !== (filters.ritual === 'yes')) return false;
    return this.matchesRange(spell.range, filters.range);
  }

  private castingTimeCategory(castingTime: string): Exclude<CastingTimeFilter, ''> {
    const value = castingTime.toLowerCase();
    if (value.includes('bonus action')) return 'bonus_action';
    if (value.includes('reaction')) return 'reaction';
    if (value.includes('action')) return 'action';
    return 'longer';
  }

  private matchesRange(range: string, filter: RangeFilter): boolean {
    if (!filter) return true;
    const normalized = range.toLowerCase();
    if (filter === 'self') return normalized.startsWith('self');
    if (filter === 'touch') return normalized.startsWith('touch');
    const distance = this.rangeInFeet(normalized);
    if (filter === 'special') return distance === null && !normalized.startsWith('self') && !normalized.startsWith('touch');
    if (distance === null) return false;
    if (filter === 'long') return distance > 120;
    return distance <= Number(filter);
  }

  private rangeInFeet(range: string): number | null {
    const match = range.match(/([\d,]+)\s*(feet|foot|ft\.?|mile|miles)/);
    if (!match) return null;
    const amount = Number(match[1].replace(',', ''));
    return match[2].startsWith('mile') ? amount * 5280 : amount;
  }
}
