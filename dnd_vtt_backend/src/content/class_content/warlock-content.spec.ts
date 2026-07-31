import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface WarlockContent extends ClassContent {
  levels: (ClassContent['levels'][number] & {
    pact_magic: { slots: number; slot_level: number };
    class_specific: { invocations_known: number };
  })[];
}

describe('Warlock class content', () => {
  const warlock = loadClassContent<WarlockContent>('warlock');

  it('uses the complete structured class shape and 2024 subclasses', () => {
    expect(warlock.index).toBe('warlock');
    expect(warlock.primary_abilities).toEqual(['charisma']);
    expect(warlock.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(warlock);
    expect(warlock.subclasses.map((subclass) => subclass.index)).toEqual([
      'archfey',
      'celestial',
      'fiend',
      'great-old-one',
    ]);
    expect(
      warlock.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') ===
            '3,6,10,14' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks the 2024 invocation and Pact Magic progressions', () => {
    const invocations = warlock.levels[0].grants?.find(
      (grant) => grant.key === 'eldritch_invocations',
    );

    expect(invocations?.chooseByLevel).toEqual({
      '1': 1,
      '2': 3,
      '5': 5,
      '7': 6,
      '9': 7,
      '12': 8,
      '15': 9,
      '18': 10,
    });
    expect(invocations?.options).toHaveLength(28);
    expect(
      invocations?.options?.find((option) => option.name === 'Devouring Blade')
        ?.prerequisite,
    ).toEqual({ level: 12, selections: ['Thirsting Blade'] });

    expect(warlock.levels[0].pact_magic).toEqual({ slots: 1, slot_level: 1 });
    expect(warlock.levels[19].pact_magic).toEqual({ slots: 4, slot_level: 5 });
    expect(warlock.levels[19].class_specific.invocations_known).toBe(10);
  });

  it('uses the structured starting-equipment package', () => {
    expect(warlock.starting_equipment.groups).toEqual([]);
    expect(warlock.starting_equipment.gold).toBe(15);
    expect(warlock.starting_equipment.goldAlternative).toBe(100);
    expectEquipmentItemsToExist(warlock.starting_equipment);
  });
});
