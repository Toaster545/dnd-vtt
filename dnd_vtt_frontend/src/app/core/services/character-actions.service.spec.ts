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
});
