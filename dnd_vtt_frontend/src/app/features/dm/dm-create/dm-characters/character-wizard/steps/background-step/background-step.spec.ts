import { TestBed } from '@angular/core/testing';
import { DndBackground } from '../../../../../../../core/services/content.service';
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
});
