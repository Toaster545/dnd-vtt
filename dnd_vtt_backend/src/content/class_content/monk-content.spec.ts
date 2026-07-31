import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface MonkContent extends ClassContent {
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    class_specific: {
      martial_arts: string;
      focus_points: number;
      unarmored_movement_bonus: number;
    };
  })[];
}

describe('Monk class content', () => {
  const monk = loadClassContent<MonkContent>('monk');
  const subclass = (index: string) =>
    monk.subclasses.find((entry) => entry.index === index);

  it('uses the complete 2024 class shape and all four subclasses', () => {
    expect(monk.index).toBe('monk');
    expect(monk.primary_abilities).toEqual(['dexterity', 'wisdom']);
    expect(monk.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(monk);
    expect(monk.subclasses.map((entry) => entry.index)).toEqual([
      'mercy',
      'shadow',
      'elements',
      'open-hand',
    ]);

    for (const index of ['mercy', 'shadow', 'elements', 'open-hand']) {
      expect(subclass(index)?.levels.map((level) => level.level)).toEqual([
        3, 6, 11, 17,
      ]);
      expect(
        subclass(index)?.levels.every(
          (level) => (level.grants?.length ?? 0) > 0,
        ),
      ).toBe(true);
    }
  });

  it('tracks the exact Martial Arts, Focus Point, and movement progressions', () => {
    expect(
      monk.levels.map((level) => level.class_specific.martial_arts),
    ).toEqual([
      '1d6',
      '1d6',
      '1d6',
      '1d6',
      '1d8',
      '1d8',
      '1d8',
      '1d8',
      '1d8',
      '1d8',
      '1d10',
      '1d10',
      '1d10',
      '1d10',
      '1d10',
      '1d10',
      '1d12',
      '1d12',
      '1d12',
      '1d12',
    ]);
    expect(
      monk.levels.map((level) => level.class_specific.focus_points),
    ).toEqual([
      0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(
      monk.levels.map((level) => level.class_specific.unarmored_movement_bonus),
    ).toEqual([
      0, 10, 10, 10, 10, 15, 15, 15, 15, 20, 20, 20, 20, 25, 25, 25, 25, 30, 30,
      30,
    ]);
  });

  it('makes class skills and the permanent tool proficiency selectable', () => {
    expect(monk.skill_choices).toEqual({
      count: 2,
      from: [
        'Acrobatics',
        'Athletics',
        'History',
        'Insight',
        'Religion',
        'Stealth',
      ],
    });
    expect(
      monk.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 2 });

    const tools = monk.levels[0].grants?.find(
      (grant) => grant.key === 'monk_tools',
    );
    expect(tools).toMatchObject({ type: 'choice', choose: 1 });
    expect(tools?.options).toHaveLength(27);
  });

  it('models Focus as one short-rest resource that scales through level 20', () => {
    const focus = monk.levels[1].grants?.find(
      (grant) => grant.key === 'monk-focus-points',
    );
    expect(focus?.action).toMatchObject({
      activation: 'free',
      uses: {
        max: 2,
        per: 'short_rest',
        maxByLevel: { '3': 3, '10': 10, '20': 20 },
      },
    });
    expect(
      monk.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'monk-focus-points'),
    ).toHaveLength(1);
  });

  it('applies unarmored AC and the full movement progression generically', () => {
    expect(
      monk.levels[0].grants?.find((grant) => grant.name === 'Unarmored Defense')
        ?.effects,
    ).toEqual([
      {
        type: 'unarmored_defense',
        tags: ['wisdom'],
        condition: 'no_armor_or_shield',
      },
    ]);

    const speedEffects = monk.levels
      .flatMap((level) => level.grants ?? [])
      .flatMap((grant) => grant.effects ?? [])
      .filter((effect) => effect.type === 'speed_bonus');
    expect(speedEffects).toHaveLength(5);
    expect(
      speedEffects.every((effect) => effect.condition === 'no_armor_or_shield'),
    ).toBe(true);
  });

  it('uses ability-scaled and long-rest subclass resources', () => {
    expect(
      subclass('open-hand')?.levels[1].grants?.find(
        (grant) => grant.key === 'wholeness-of-body',
      )?.action,
    ).toMatchObject({
      activation: 'bonus_action',
      uses: {
        maxAbilityModifier: 'wisdom',
        minimum: 1,
        per: 'long_rest',
      },
    });
    expect(
      subclass('mercy')?.levels[3].grants?.find(
        (grant) => grant.key === 'hand-of-ultimate-mercy',
      )?.action,
    ).toEqual({
      activation: 'action',
      uses: { max: 1, per: 'long_rest' },
    });
  });

  it('keeps activation-time subclass decisions out of saved choices', () => {
    expect(
      monk.subclasses.flatMap((entry) =>
        entry.levels.flatMap((level) =>
          (level.grants ?? []).filter((grant) => grant.type === 'choice'),
        ),
      ),
    ).toEqual([]);
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(monk.starting_equipment.gold).toBe(11);
    expect(monk.starting_equipment.goldAlternative).toBe(50);
    expect(
      monk.starting_equipment.fixed.map((reference) => reference.item),
    ).toEqual(['spear', 'dagger', 'explorers-pack']);
    expect(monk.starting_equipment.groups).toHaveLength(1);
    expectEquipmentItemsToExist(monk.starting_equipment);
  });
});
