import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DndClass, DndFeat, TraitGrant } from '../../../../../core/services/content.service';
import { ClassStepComponent } from './class-step';

describe('ClassStepComponent skill choices', () => {
  it('enforces species lineage prerequisites for legacy racial feats', async () => {
    await TestBed.configureTestingModule({ imports: [ClassStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ClassStepComponent);
    fixture.componentRef.setInput('classes', []);
    fixture.componentRef.setInput('characterLevel', 4);
    fixture.componentRef.setInput('baseAbilityScores', {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10,
    });
    fixture.componentRef.setInput('species', 'elf');
    fixture.componentRef.setInput('speciesChoices', { elven_lineage: ['Drow'] });
    fixture.detectChanges();

    const drowFeat = {
      index: 'drow-high-magic', name: 'Drow High Magic', description: '', category: 'general',
      prerequisite: { level: 4, species: ['elf'], speciesChoices: { elven_lineage: ['Drow'] } },
    } satisfies DndFeat;
    const woodFeat = {
      ...drowFeat, index: 'wood-elf-magic', name: 'Wood Elf Magic',
      prerequisite: { level: 4, species: ['elf'], speciesChoices: { elven_lineage: ['Wood Elf'] } },
    } satisfies DndFeat;

    expect(fixture.componentInstance.qualifiesForFeat(drowFeat)).toBe(true);
    expect(fixture.componentInstance.qualifiesForFeat(woodFeat)).toBe(false);
  });

  it('does not allow a skill proficiency already granted by another character source', async () => {
    await TestBed.configureTestingModule({ imports: [ClassStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ClassStepComponent);
    const grant = {
      type: 'skill_choice', key: 'skills', name: 'Skill Proficiencies', choose: 2,
      skills: ['Perception', 'Stealth', 'Survival'],
    } satisfies TraitGrant;
    const ranger = {
      index: 'ranger', name: 'Ranger', levels: [{ level: 1, features: [], grants: [grant] }],
      primary_abilities: ['dexterity', 'wisdom'], hit_die: 10,
      saving_throws: ['strength', 'dexterity'], armor_training: [],
      weapon_proficiencies: [], tool_proficiencies: [],
      subclasses: [], subclass_level: 3, skill_choices: { count: 2, from: grant.skills },
      starting_equipment: { fixed: [], groups: [], gold: 0, goldAlternative: 0 },
    } as unknown as DndClass;
    fixture.componentRef.setInput('classes', [ranger]);
    fixture.componentRef.setInput('selectedClasses', [{
      cls: ranger, level: 1, subclass: '', skills: ['Survival'], traits: {},
    }]);
    fixture.componentRef.setInput('characterLevel', 1);
    fixture.componentRef.setInput('baseAbilityScores', {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10,
    });
    fixture.componentRef.setInput('unavailableSkills', ['Perception', 'Survival']);
    fixture.detectChanges();
    fixture.componentInstance.openFromList(ranger);
    fixture.detectChanges();

    expect(fixture.componentInstance.skillConflict(grant, 'Survival')).toBe(true);
    const grantHeading = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent?.includes('Skill Proficiencies'));
    expect(grantHeading?.textContent).toContain('*');
    expect(grantHeading?.querySelector('.bg-danger')).toBeTruthy();
    fixture.componentInstance.toggleDraftSkill(grant, 'Perception');
    expect(fixture.componentInstance.draftSkills()).toEqual(['Survival']);
    fixture.componentInstance.toggleDraftSkill(grant, 'Survival');
    expect(fixture.componentInstance.draftSkills()).toEqual([]);
  });

  it('restricts Expertise to listed proficient skills while keeping stale picks removable', async () => {
    await TestBed.configureTestingModule({ imports: [ClassStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ClassStepComponent);
    const grant = {
      type: 'expertise_choice', key: 'scholar', name: 'Scholar', choose: 1,
      skills: ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Religion'],
    } satisfies TraitGrant;
    const wizard = {
      index: 'wizard', name: 'Wizard', levels: [{ level: 1, features: [], grants: [grant] }],
      primary_abilities: ['intelligence'], hit_die: 6,
      saving_throws: ['intelligence', 'wisdom'], armor_training: [],
      weapon_proficiencies: [], tool_proficiencies: [],
      subclasses: [], subclass_level: 3, skill_choices: { count: 2, from: [] },
      starting_equipment: { fixed: [], groups: [], gold: 0, goldAlternative: 0 },
    } as unknown as DndClass;
    fixture.componentRef.setInput('classes', [wizard]);
    fixture.componentRef.setInput('selectedClasses', [{
      cls: wizard, level: 1, subclass: '', skills: [], traits: { scholar: ['Athletics'] },
    }]);
    fixture.componentRef.setInput('characterLevel', 1);
    fixture.componentRef.setInput('baseAbilityScores', {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10,
    });
    fixture.componentRef.setInput('proficientSkills', ['Arcana', 'Athletics', 'Insight']);
    fixture.detectChanges();
    fixture.componentInstance.openFromList(wizard);

    expect(fixture.componentInstance.expertiseOptions(grant)).toEqual(['Arcana', 'Athletics']);
    fixture.componentInstance.toggleExpertise(grant, 'Insight');
    expect(fixture.componentInstance.draftTraits()['scholar']).toEqual(['Athletics']);
    fixture.componentInstance.toggleExpertise(grant, 'Athletics');
    expect(fixture.componentInstance.draftTraits()['scholar']).toEqual([]);
  });
});
