import { describe, expect, it } from 'vitest';
import { DndClass } from './content.service';
import { CharacterActionsService } from './character-actions.service';

const barbarian = {
  name: 'Barbarian',
  levels: [
    {
      level: 1,
      grants: [
        {
          type: 'feature',
          key: 'rage',
          name: 'Rage',
          action: {
            activation: 'bonus_action',
            uses: {
              max: 2,
              maxByLevel: { '1': 2, '3': 3, '6': 4, '12': 5, '17': 6 },
              per: 'long_rest',
              shortRestRestore: 1,
            },
          },
        },
      ],
    },
  ],
} as unknown as DndClass;

const bard = {
  name: 'Bard',
  levels: [{
    level: 1,
    grants: [{
      type: 'feature', key: 'bardic-inspiration', name: 'Bardic Inspiration',
      action: {
        activation: 'bonus_action',
        uses: {
          max: 1, maxAbilityModifier: 'charisma', minimum: 1,
          per: 'long_rest', perByLevel: { '5': 'short_rest' },
        },
      },
    }],
  }],
} as unknown as DndClass;

describe('CharacterActionsService', () => {
  const service = new CharacterActionsService();

  it.each([
    [1, 2],
    [3, 3],
    [6, 4],
    [12, 5],
    [17, 6],
    [20, 6],
  ])('gives a level %i Barbarian %i Rage uses', (level, expected) => {
    const [rage] = service.compute([{ data: barbarian, level }], {});
    expect(rage.maxUses).toBe(expected);
  });

  it('restores exactly one expended Rage on a Short Rest and all on a Long Rest', () => {
    const [rage] = service.compute([{ data: barbarian, level: 6 }], { rage: 3 });
    expect(service.rest({ rage: 3 }, [rage], 'short_rest')).toEqual({ rage: 2 });
    expect(service.rest({ rage: 3 }, [rage], 'long_rest')).toEqual({});
  });

  it('uses an ability modifier for a resource maximum, with its declared minimum', () => {
    const scores = {
      strength: 10, dexterity: 10, constitution: 10,
      intelligence: 10, wisdom: 10, charisma: 18,
    };
    const [inspiration] = service.compute([{ data: bard, level: 1 }], {}, scores);
    expect(inspiration.maxUses).toBe(4);

    const [minimum] = service.compute([{ data: bard, level: 1 }], {}, { ...scores, charisma: 8 });
    expect(minimum.maxUses).toBe(1);
  });

  it('changes a resource recovery cadence at the configured class level', () => {
    const [level4] = service.compute([{ data: bard, level: 4 }], {});
    const [level5] = service.compute([{ data: bard, level: 5 }], {});
    expect(level4.per).toBe('long_rest');
    expect(level5.per).toBe('short_rest');
  });
});
