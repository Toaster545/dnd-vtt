import { DndBackground } from '../services/content.service';
import {
  BACKGROUND_ABILITY_OPTIONS_KEY,
  defaultBackgroundAbilities,
  hasCustomizedBackgroundAbilities,
  resolveBackgroundAbilityBonuses,
  resolveBackgroundAbilities,
} from './background-abilities';

const acolyte = {
  grants: [{
    type: 'ability_choice', key: 'ability_scores', name: 'Ability Scores', points: 3,
    abilities: ['intelligence', 'wisdom', 'charisma'],
  }],
} as DndBackground;

describe('background ability customization', () => {
  it('uses the official three abilities by default', () => {
    expect(defaultBackgroundAbilities(acolyte)).toEqual(['intelligence', 'wisdom', 'charisma']);
    expect(resolveBackgroundAbilities(acolyte, {})).toEqual(['intelligence', 'wisdom', 'charisma']);
  });

  it('uses a valid character-specific set of three abilities', () => {
    const choices = {
      [BACKGROUND_ABILITY_OPTIONS_KEY]: ['strength', 'constitution', 'wisdom'],
    };
    expect(resolveBackgroundAbilities(acolyte, choices)).toEqual(['strength', 'constitution', 'wisdom']);
    expect(hasCustomizedBackgroundAbilities(acolyte, choices)).toBe(true);
  });

  it('falls back safely for incomplete, duplicate, or unknown options', () => {
    for (const options of [
      ['strength', 'wisdom'],
      ['strength', 'strength', 'wisdom'],
      ['strength', 'wisdom', 'luck'],
    ]) {
      expect(resolveBackgroundAbilities(acolyte, {
        [BACKGROUND_ABILITY_OPTIONS_KEY]: options,
      })).toEqual(['intelligence', 'wisdom', 'charisma']);
    }
  });

  it('does not mark a reordered official set as customized', () => {
    expect(hasCustomizedBackgroundAbilities(acolyte, {
      [BACKGROUND_ABILITY_OPTIONS_KEY]: ['charisma', 'intelligence', 'wisdom'],
    })).toBe(false);
  });

  it('applies bonuses only to the effective eligible abilities', () => {
    expect(resolveBackgroundAbilityBonuses(acolyte, {
      [BACKGROUND_ABILITY_OPTIONS_KEY]: ['strength', 'constitution', 'wisdom'],
      ability_scores: ['strength', 'strength', 'wisdom'],
    })).toMatchObject({ strength: 2, wisdom: 1, intelligence: 0, charisma: 0 });

    expect(resolveBackgroundAbilityBonuses(acolyte, {
      [BACKGROUND_ABILITY_OPTIONS_KEY]: ['strength', 'wisdom'],
      ability_scores: ['strength', 'strength', 'wisdom'],
    })).toMatchObject({ strength: 0, wisdom: 1 });

    expect(resolveBackgroundAbilityBonuses(acolyte, {
      ability_scores: ['wisdom', 'wisdom', 'wisdom', 'charisma'],
    })).toMatchObject({ wisdom: 2, charisma: 1 });
  });
});
