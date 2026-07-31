import { describe, expect, it } from 'vitest';
import { Character, defaultCharacter } from '../models/character.model';
import { DndClass } from './content.service';
import { CharacterStatsService } from './character-stats.service';

const bard = {
  name: 'Bard',
  hit_die: 8,
  saving_throws: ['dexterity', 'charisma'],
  weapon_proficiencies: ['Simple Weapons'],
  levels: [
    {
      level: 2,
      grants: [
        {
          type: 'feature',
          name: 'Jack of All Trades',
          effects: [{ type: 'untrained_skill_bonus', tags: ['half_proficiency'] }],
        },
      ],
    },
  ],
  subclasses: [],
} as unknown as DndClass;

describe('CharacterStatsService', () => {
  it('adds half proficiency to untrained skills without changing proficient skills', () => {
    const character: Character = {
      ...defaultCharacter(),
      name: 'Test Bard',
      class: 'Bard',
      level: 5,
      skills: { Performance: true },
    };
    const stats = new CharacterStatsService().compute(
      character,
      bard,
      null,
      [],
      [{ data: bard, choices: {}, level: 5 }],
    );

    expect(stats.skill_bonuses['Arcana']).toBe(1);
    expect(stats.skill_bonuses['Performance']).toBe(3);
  });
});
