import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DndBackground, DndFeat } from '../../../../../core/services/content.service';
import { BackgroundStepComponent } from './background-step';

const merchant = {
  index: 'merchant',
  name: 'Merchant',
  skill_proficiencies: ['Animal Handling', 'Persuasion'],
  tool_proficiencies: ["Navigator's Tools"],
  languages: 'None',
  starting_equipment: { fixed: [], groups: [], gold: 22, goldAlternative: 50 },
  feature: 'Origin Feat: Lucky',
  grants: [],
} satisfies DndBackground;

const skilled = {
  index: 'skilled',
  name: 'Skilled',
  description: 'Gain proficiency in three skills of your choice.',
  category: 'origin',
  grants: [{
    type: 'skill_choice',
    key: 'origin_feat:skilled_skills',
    name: 'Skill Proficiencies',
    choose: 3,
  }],
} satisfies DndFeat;

describe('BackgroundStepComponent', () => {
  it('opens the skill editor with both background defaults selected', async () => {
    await TestBed.configureTestingModule({ imports: [BackgroundStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BackgroundStepComponent);
    fixture.componentRef.setInput('backgrounds', [merchant]);
    fixture.componentRef.setInput('baseAbilityScores', {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10,
    });
    fixture.componentInstance.openFromList(merchant);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const edit = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Customize background skills"]',
    )!;
    edit.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const values = Array.from(
      root.querySelectorAll<HTMLSelectElement>('select'),
      select => select.value,
    );
    expect(values).toEqual(['Animal Handling', 'Persuasion']);
  });

  it('shows the origin feat description by default and saves its required skill choices', async () => {
    await TestBed.configureTestingModule({ imports: [BackgroundStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BackgroundStepComponent);
    const background = { ...merchant, feature: 'Origin Feat: Skilled' };
    fixture.componentRef.setInput('backgrounds', [background]);
    fixture.componentRef.setInput('feats', [skilled]);
    fixture.componentRef.setInput('unavailableSkills', ['Perception']);
    fixture.componentRef.setInput('baseAbilityScores', {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10,
    });
    fixture.componentInstance.openFromList(background);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain(skilled.description);
    const grant = skilled.grants![0];
    if (grant.type !== 'skill_choice') throw new Error('Expected Skilled to grant a skill choice');
    fixture.componentInstance.toggleFeatSkill(background, grant, 'Perception');
    expect(fixture.componentInstance.draftTraits()[grant.key]).toBeUndefined();

    for (const skill of ['Athletics', 'Arcana', 'History']) {
      fixture.componentInstance.toggleFeatSkill(background, grant, skill);
    }
    expect(fixture.componentInstance.draftTraits()[grant.key]).toEqual(['Athletics', 'Arcana', 'History']);
  });

  it('identifies an existing background skill conflict without preventing its removal', async () => {
    await TestBed.configureTestingModule({ imports: [BackgroundStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BackgroundStepComponent);
    const background = {
      ...merchant,
      skill_proficiencies: ['Survival', 'Persuasion'],
    };
    fixture.componentRef.setInput('backgrounds', [background]);
    fixture.componentRef.setInput('selected', { background, traits: {} });
    fixture.componentRef.setInput('unavailableSkills', ['Survival']);
    fixture.componentRef.setInput('baseAbilityScores', {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 10,
    });
    fixture.detectChanges();
    fixture.componentInstance.editSelected();
    fixture.detectChanges();

    expect(fixture.componentInstance.conflictingBackgroundSkills(background)).toEqual(['Survival']);
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain('Survival already selected by another proficiency source');
  });
});
