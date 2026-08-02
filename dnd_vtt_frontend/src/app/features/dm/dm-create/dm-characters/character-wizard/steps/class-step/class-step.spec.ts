import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DndClass, TraitGrant } from '../../../../../../../core/services/content.service';
import { ClassStepComponent } from './class-step';

describe('ClassStepComponent skill choices', () => {
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
});
