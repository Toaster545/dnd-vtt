import { describe, expect, it } from 'vitest';
import { Character, defaultCharacter } from '../models/character.model';
import { DndClass, DndItem } from './content.service';
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

const monk = {
  name: 'Monk',
  hit_die: 8,
  saving_throws: ['strength', 'dexterity'],
  weapon_proficiencies: ['Simple Weapons', 'Martial Weapons with the Light property'],
  levels: [
    {
      level: 14,
      grants: [
        {
          type: 'feature',
          name: 'Disciplined Survivor',
          effects: [{
            type: 'saving_throw_proficiency',
            tags: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
          }],
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

  it('adds saving throw proficiencies granted by a class effect', () => {
    const character: Character = {
      ...defaultCharacter(),
      name: 'Disciplined Monk',
      class: 'Monk',
      level: 14,
    };
    const stats = new CharacterStatsService().compute(
      character, monk, null, [], [{ data: monk, choices: {}, level: 14 }],
    );

    expect([...stats.saving_throw_proficient]).toEqual([
      'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
    ]);
    expect(stats.saving_throw_bonuses.wisdom).toBe(5);
  });

  it('limits a Monk martial-weapon proficiency to weapons with Light', () => {
    const weapons: DndItem[] = [
      {
        index: 'shortsword', name: 'Shortsword', type: 'weapon', category: 'Martial Melee',
        damage: '1d6', damage_type: 'Piercing', properties: ['Finesse', 'Light'],
        weight: 2, cost: '10 GP', description: '',
      },
      {
        index: 'longsword', name: 'Longsword', type: 'weapon', category: 'Martial Melee',
        damage: '1d8', damage_type: 'Slashing', properties: ['Versatile'],
        weight: 3, cost: '15 GP', description: '',
      },
    ];
    const character: Character = {
      ...defaultCharacter(),
      name: 'Armed Monk',
      class: 'Monk',
      level: 1,
      equipment: weapons.map(weapon => ({
        itemIndex: weapon.index, name: weapon.name, quantity: 1, equipped: true,
      })),
    };
    const stats = new CharacterStatsService().compute(
      character, monk, null, [], [{ data: monk, choices: {}, level: 1 }], weapons,
    );

    expect(stats.weapon_attacks.map(attack => attack.attack_bonus)).toEqual([2, 0]);
  });
});
