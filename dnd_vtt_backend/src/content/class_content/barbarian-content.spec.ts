import {
  ClassContent,
  Grant,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface BarbarianContent extends ClassContent {
  levels: (ClassContent['levels'][number] & {
    class_specific: {
      rages: number;
      rage_damage: number;
      weapon_masteries: number;
    };
  })[];
}

describe('Barbarian class content', () => {
  const barbarian = loadClassContent<BarbarianContent>('barbarian');

  it('uses the complete structured class shape and 2024 subclasses', () => {
    expect(barbarian.index).toBe('barbarian');
    expect(barbarian.primary_abilities).toEqual(['strength']);
    expect(barbarian.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(barbarian);
    expect(barbarian.subclasses.map((subclass) => subclass.index)).toEqual([
      'berserker',
      'wild-heart',
      'world-tree',
      'zealot',
    ]);
    expect(
      barbarian.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') ===
            '3,6,10,14' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks Rage, Rage Damage, and Weapon Mastery at every level', () => {
    expect(barbarian.levels.map((level) => level.class_specific.rages)).toEqual(
      [2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6],
    );
    expect(
      barbarian.levels.map((level) => level.class_specific.rage_damage),
    ).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
    expect(
      barbarian.levels.map((level) => level.class_specific.weapon_masteries),
    ).toEqual([2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it('declares progressive Rage uses and partial Short Rest recovery once', () => {
    const rage = barbarian.levels[0].grants?.find(
      (grant) => grant.key === 'rage',
    );
    expect(rage?.action).toEqual({
      activation: 'bonus_action',
      uses: {
        max: 2,
        maxByLevel: { '1': 2, '3': 3, '6': 4, '12': 5, '17': 6 },
        per: 'long_rest',
        shortRestRestore: 1,
      },
    });
    expect(
      barbarian.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'rage'),
    ).toHaveLength(1);
  });

  it('makes Primal Knowledge a separate selectable proficiency', () => {
    const grant: Grant | undefined = barbarian.levels[2].grants?.find(
      (candidate) => candidate.key === 'primal_knowledge_skill',
    );
    expect(grant?.type).toBe('skill_choice');
    expect(grant?.choose).toBe(1);
    expect(grant?.skills).toHaveLength(6);
  });

  it('uses the structured starting-equipment package', () => {
    expect(barbarian.starting_equipment.groups).toEqual([]);
    expect(barbarian.starting_equipment.gold).toBe(15);
    expect(barbarian.starting_equipment.goldAlternative).toBe(75);
    expect(
      barbarian.starting_equipment.fixed.find((ref) => ref.item === 'handaxe')
        ?.quantity,
    ).toBe(4);
    expectEquipmentItemsToExist(barbarian.starting_equipment);
  });
});
