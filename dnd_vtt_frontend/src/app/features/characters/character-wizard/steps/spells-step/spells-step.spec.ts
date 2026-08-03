import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { DndSpell } from '../../../../../core/services/content.service';
import type { SpellcastingResolution } from '../../../../../core/utils/spellcasting';
import { SpellsStepComponent } from './spells-step';

const spells = [
  {
    index: 'minor-illusion', name: 'Minor Illusion', level: 0, school: 'Illusion',
    casting_time: 'Action', range: '30 feet', concentration: false, ritual: false,
  },
  {
    index: 'acid-splash', name: 'Acid Splash', level: 0, school: 'Evocation',
    casting_time: 'Bonus Action', range: '60 feet', concentration: true, ritual: false,
  },
  {
    index: 'cure-wounds', name: 'Cure Wounds', level: 1, school: 'Abjuration',
    casting_time: 'Action', range: 'Touch', concentration: false, ritual: false,
  },
] as DndSpell[];

function resolution(selected: string[], invalid: string[] = []): SpellcastingResolution {
  return {
    sources: [{
      key: 'class:wizard', name: 'Wizard', origin: 'class', list: 'Wizard', mode: 'spellbook',
      progression: 'full', castingAbility: 'intelligence', spellAttackBonus: 5, spellSaveDc: 13,
      maxSpellLevel: 1,
    }],
    requirements: [{
      key: 'class:wizard:cantrips', sourceKey: 'class:wizard', sourceName: 'Wizard',
      name: 'Wizard Cantrips', kind: 'cantrips', destination: 'known', required: 1,
      selectedSpellIndices: selected, validSelectedSpellIndices: selected.filter(index => !invalid.includes(index)),
      invalidSelectedSpellIndices: invalid, eligibleSpellIndices: ['minor-illusion', 'acid-splash'],
      unavailableSpellIndices: [], unavailableSpellSources: {},
      remaining: selected.some(index => !invalid.includes(index)) ? 0 : 1, countsAgainstLimit: true,
      errors: invalid.map(spellIndex => ({
        code: 'ineligible_spell' as const, spellIndex, requirementKey: 'class:wizard:cantrips',
        message: `${spellIndex} is no longer eligible.`,
      })),
    }],
    known: [], spellbook: [], prepared: [], alwaysPrepared: [], slotPools: [],
    validationErrors: [], isComplete: selected.length === 1 && invalid.length === 0,
  };
}

describe('SpellsStepComponent', () => {
  it('enforces the requirement maximum while keeping invalid selections removable', async () => {
    await TestBed.configureTestingModule({ imports: [SpellsStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SpellsStepComponent);
    fixture.componentRef.setInput('spells', spells);
    fixture.componentRef.setInput('resolution', resolution(['minor-illusion']));
    fixture.detectChanges();

    const emitted = vi.fn();
    fixture.componentInstance.spellToggled.subscribe(emitted);
    expect(fixture.componentInstance.canToggle(fixture.componentInstance.groups()[0].requirements[0], 'acid-splash')).toBe(false);

    fixture.componentRef.setInput('resolution', resolution(['lost-spell'], ['lost-spell']));
    fixture.detectChanges();
    const requirement = fixture.componentInstance.groups()[0].requirements[0];
    expect(fixture.componentInstance.canToggle(requirement, 'lost-spell')).toBe(true);
    fixture.componentInstance.toggle(requirement, 'lost-spell');
    expect(emitted).toHaveBeenCalledWith({ requirementKey: 'class:wizard:cantrips', spellIndex: 'lost-spell' });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Remove');
  });

  it('disables spells acquired from another source and marks existing duplicates as conflicts', async () => {
    await TestBed.configureTestingModule({ imports: [SpellsStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SpellsStepComponent);
    fixture.componentRef.setInput('spells', spells);

    const unavailable = resolution([]);
    unavailable.requirements[0].unavailableSpellIndices = ['minor-illusion'];
    unavailable.requirements[0].unavailableSpellSources = { 'minor-illusion': 'Forest Gnome Magic' };
    fixture.componentRef.setInput('resolution', unavailable);
    fixture.detectChanges();

    const spellButton = () => Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent?.includes('Minor Illusion'))!;
    expect(spellButton().disabled).toBe(true);
    expect(spellButton().className).toContain('border-white/8');
    expect(spellButton().title).toContain('Forest Gnome Magic');
    expect(spellButton().textContent).toContain('Already selected');

    const duplicate = resolution(['minor-illusion'], ['minor-illusion']);
    duplicate.requirements[0].errors[0] = {
      code: 'duplicate_spell',
      requirementKey: 'class:wizard:cantrips',
      spellIndex: 'minor-illusion',
      message: 'Minor Illusion is already selected from Forest Gnome Magic.',
    };
    fixture.componentRef.setInput('resolution', duplicate);
    fixture.detectChanges();

    expect(spellButton().disabled).toBe(false);
    expect(spellButton().className).toContain('border-danger/60');
    expect(spellButton().title).toContain('Duplicate spell');
    expect(spellButton().textContent).toContain('Remove');
  });

  it('filters by spell metadata while always grouping visible spells by level', async () => {
    await TestBed.configureTestingModule({ imports: [SpellsStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SpellsStepComponent);
    const withLevels = resolution([]);
    withLevels.requirements[0] = {
      ...withLevels.requirements[0],
      name: 'Evocation Savant',
      subclassName: 'Evoker',
      kind: 'bonus',
      eligibleSpellIndices: ['minor-illusion', 'acid-splash', 'cure-wounds'],
    };
    fixture.componentRef.setInput('spells', spells);
    fixture.componentRef.setInput('resolution', withLevels);
    fixture.detectChanges();

    const requirement = fixture.componentInstance.groups()[0].requirements[0];
    expect((fixture.nativeElement as HTMLElement).querySelector('select')).toBeNull();
    const filterButton = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent?.includes('Filters'))!;
    expect(Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).filter(button => button.textContent?.includes('Filters'))).toHaveLength(2);
    filterButton.click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('select')).toHaveLength(6);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Close spell filters"]')!
      .click();
    fixture.detectChanges();
    expect(fixture.componentInstance.openFilterScope()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('select')).toHaveLength(0);
    filterButton.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleSpellGroups(requirement).map(group => group.label)).toEqual([
      'Cantrips', 'Level 1 Spells',
    ]);
    expect((fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ')).toContain('Evocation Savant* — Evoker');

    const global = fixture.componentInstance.globalFilterKey;
    fixture.componentInstance.filtersByScope.set({
      [global]: {
        level: null, school: '', range: '', castingTime: 'bonus_action', concentration: '', ritual: '',
      },
    });
    expect(fixture.componentInstance.visibleSpells(requirement).map(spell => spell.index)).toEqual(['acid-splash']);
    fixture.detectChanges();
    fixture.componentInstance.toggleFilters(global);
    fixture.detectChanges();
    fixture.componentInstance.toggleFilters(global);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>('select')[3].value).toBe('bonus_action');

    fixture.componentInstance.resetFilters(global);
    fixture.componentInstance.toggleFilters(global);
    fixture.detectChanges();
    const localFilterButton = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).filter(button => button.textContent?.includes('Filters')).at(-1)!;
    localFilterButton.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.openFilterScope()).toBe(requirement.key);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('select')).toHaveLength(6);

    fixture.componentInstance.filtersByScope.update(current => ({
      ...current,
      [requirement.key]: {
        level: null, school: '', range: '30', castingTime: '', concentration: '', ritual: '',
      },
    }));
    expect(fixture.componentInstance.visibleSpells(requirement).map(spell => spell.index)).toEqual(['minor-illusion']);
    fixture.componentInstance.resetFilters(requirement.key);
    fixture.componentInstance.filtersByScope.update(current => ({
      ...current,
      [requirement.key]: {
        level: null, school: 'Abjuration', range: '', castingTime: '', concentration: '', ritual: '',
      },
    }));
    expect(fixture.componentInstance.visibleSpells(requirement).map(spell => spell.index)).toEqual(['cure-wounds']);
    fixture.detectChanges();
    fixture.componentInstance.toggleFilters(requirement.key);
    fixture.detectChanges();
    fixture.componentInstance.toggleFilters(requirement.key);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>('select')[1].value).toBe('Abjuration');

    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('Wizard*');
    expect(text).toContain('Evocation Savant*');
  });

  it('collapses a requirement on its first incomplete-to-complete transition and lets it reopen', async () => {
    await TestBed.configureTestingModule({ imports: [SpellsStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SpellsStepComponent);
    fixture.componentRef.setInput('spells', spells);
    fixture.componentRef.setInput('resolution', resolution([]));
    fixture.detectChanges();
    await fixture.whenStable();

    const key = 'class:wizard:cantrips';
    expect(fixture.componentInstance.isRequirementCollapsed(key)).toBe(false);
    fixture.componentRef.setInput('resolution', resolution(['minor-illusion']));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.isRequirementCollapsed(key)).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Wizard*');

    fixture.componentInstance.toggleRequirement(key);
    expect(fixture.componentInstance.isRequirementCollapsed(key)).toBe(false);

    fixture.componentRef.setInput('resolution', resolution([]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentRef.setInput('resolution', resolution(['minor-illusion']));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.isRequirementCollapsed(key)).toBe(false);

    fixture.componentInstance.toggleGroup('class:wizard');
    expect(fixture.componentInstance.isGroupCollapsed('class:wizard')).toBe(true);
  });
});
