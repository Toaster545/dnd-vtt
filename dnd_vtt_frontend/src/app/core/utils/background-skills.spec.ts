import { BACKGROUND_SKILLS_KEY, resolveBackgroundSkills } from './background-skills';

const merchant = { skill_proficiencies: ['Animal Handling', 'Persuasion'] };

describe('resolveBackgroundSkills', () => {
  it('uses the background defaults when no customization was saved', () => {
    expect(resolveBackgroundSkills(merchant, {})).toEqual(['Animal Handling', 'Persuasion']);
  });

  it('uses two saved custom skills', () => {
    expect(resolveBackgroundSkills(merchant, {
      [BACKGROUND_SKILLS_KEY]: ['Nature', 'Persuasion'],
    })).toEqual(['Nature', 'Persuasion']);
  });

  it('rejects duplicate or unknown custom skills', () => {
    expect(resolveBackgroundSkills(merchant, {
      [BACKGROUND_SKILLS_KEY]: ['Nature', 'Nature'],
    })).toEqual(['Animal Handling', 'Persuasion']);
    expect(resolveBackgroundSkills(merchant, {
      [BACKGROUND_SKILLS_KEY]: ['Nature', 'Rice Trading'],
    })).toEqual(['Animal Handling', 'Persuasion']);
  });
});
