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

const cleric = {
  name: 'Cleric',
  hit_die: 8,
  saving_throws: ['wisdom', 'charisma'],
  weapon_proficiencies: ['Simple Weapons'],
  levels: [
    {
      level: 1,
      grants: [
        {
          type: 'choice',
          key: 'divine_order',
          name: 'Divine Order',
          choose: 1,
          options: [
            {
              name: 'Thaumaturge',
              effects: [
                {
                  type: 'skill_ability_bonus',
                  tags: ['Arcana', 'Religion'],
                  ability: 'wisdom',
                  minimum: 1,
                },
              ],
            },
          ],
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

  it('adds a chosen ability modifier to the skills named by a generic effect', () => {
    const character: Character = {
      ...defaultCharacter(),
      name: 'Test Cleric',
      class: 'Cleric',
      level: 1,
      ability_scores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 8,
        wisdom: 16,
        charisma: 10,
      },
      skills: { Religion: true },
    };
    const stats = new CharacterStatsService().compute(
      character,
      cleric,
      null,
      [],
      [
        {
          data: cleric,
          choices: { divine_order: ['Thaumaturge'] },
          level: 1,
        },
      ],
    );

    expect(stats.skill_bonuses['Arcana']).toBe(2);
    expect(stats.skill_bonuses['Religion']).toBe(4);
    expect(stats.skill_bonuses['History']).toBe(-1);
  });

  it('honors the minimum bonus declared by a skill ability effect', () => {
    const character: Character = {
      ...defaultCharacter(),
      name: 'Test Thaumaturge',
      class: 'Cleric',
      level: 1,
      ability_scores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 8,
        wisdom: 8,
        charisma: 10,
      },
    };
    const stats = new CharacterStatsService().compute(
      character,
      cleric,
      null,
      [],
      [
        {
          data: cleric,
          choices: { divine_order: ['Thaumaturge'] },
          level: 1,
        },
      ],
    );

    expect(stats.skill_bonuses['Arcana']).toBe(0);
    expect(stats.skill_bonuses['Religion']).toBe(0);
  });
});
