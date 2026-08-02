import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DndRace, TraitGrant } from '../../../../../core/services/content.service';
import { RaceStepComponent } from './race-step';

describe('RaceStepComponent skill choices', () => {
  it('keeps an externally selected skill visible but unavailable', async () => {
    await TestBed.configureTestingModule({ imports: [RaceStepComponent] }).compileComponents();
    const fixture = TestBed.createComponent(RaceStepComponent);
    const grant = {
      type: 'skill_choice', key: 'keen_senses', name: 'Keen Senses', choose: 1,
      skills: ['Insight', 'Perception', 'Survival'],
    } satisfies TraitGrant;
    const race = {
      index: 'elf', name: 'Elf', speed: 30, size: 'Medium', size_options: ['Medium'],
      traits: [], subraces: [], grants: [grant],
    } as unknown as DndRace;
    fixture.componentRef.setInput('races', [race]);
    fixture.componentRef.setInput('selected', {
      race, subrace: null, traits: { [grant.key]: ['Survival'] },
    });
    fixture.componentRef.setInput('unavailableSkills', ['Perception', 'Survival']);
    fixture.detectChanges();
    fixture.componentInstance.openFromList(race);
    fixture.detectChanges();

    expect(fixture.componentInstance.skillConflict(grant, 'Survival')).toBe(true);
    const grantHeading = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent?.includes('Keen Senses'));
    expect(grantHeading?.textContent).toContain('*');
    expect(grantHeading?.querySelector('.bg-danger')).toBeTruthy();
    fixture.componentInstance.toggleTrait(grant, 'Perception');
    expect(fixture.componentInstance.draftTraits()[grant.key]).toEqual(['Survival']);
    fixture.componentInstance.toggleTrait(grant, 'Survival');
    expect(fixture.componentInstance.draftTraits()[grant.key]).toEqual([]);
  });
});
