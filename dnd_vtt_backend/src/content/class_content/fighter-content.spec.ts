import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

describe('Fighter class content', () => {
  const fighter = loadClassContent<ClassContent>('fighter');
  const grantsAt = (level: number) =>
    fighter.levels.find((entry) => entry.level === level)?.grants ?? [];

  it('uses the complete structured class shape and all four subclasses', () => {
    expect(fighter.index).toBe('fighter');
    expect(fighter.primary_abilities).toEqual(['strength', 'dexterity']);
    expect(fighter.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(fighter);
    expect(fighter.subclasses.map((subclass) => subclass.index)).toEqual([
      'champion',
      'battle-master',
      'eldritch-knight',
      'psi-warrior',
    ]);
    expect(
      fighter.subclasses.every((subclass) =>
        subclass.levels.every(
          (level) =>
            (level.grants?.length ?? 0) > 0 ||
            Object.keys(level.spell_slots ?? {}).length > 0,
        ),
      ),
    ).toBe(true);
  });

  it('declares every level-1 choice and Second Wind resource', () => {
    expect(grantsAt(1).find((grant) => grant.key === 'skills')).toMatchObject({
      type: 'skill_choice',
      choose: 2,
    });
    expect(
      grantsAt(1).find((grant) => grant.key === 'fighting_style'),
    ).toMatchObject({ type: 'feat_pick', choose: 1, category: 'fighting_style' });
    expect(
      grantsAt(1).find((grant) => grant.key === 'weapon_mastery'),
    ).toMatchObject({ type: 'weapon_mastery', choose: 3 });
    expect(grantsAt(1).find((grant) => grant.key === 'second-wind')?.action).toEqual({
      activation: 'bonus_action',
      uses: { max: 2, per: 'long_rest' },
    });
  });

  it('upgrades Action Surge without creating a second resource key', () => {
    const actionSurges = fighter.levels
      .flatMap((level) => level.grants ?? [])
      .filter((grant) => grant.key === 'action-surge');

    expect(actionSurges).toHaveLength(2);
    expect(actionSurges.map((grant) => grant.action?.uses)).toEqual([
      { max: 1, per: 'short_rest' },
      { max: 2, per: 'short_rest' },
    ]);
  });

  it('provides every Fighter ASI, Weapon Mastery increase, and Epic Boon', () => {
    const allGrants = fighter.levels.flatMap((level) => level.grants ?? []);
    expect(
      allGrants
        .filter((grant) => grant.type === 'ability_choice')
        .map((grant) => grant.key),
    ).toEqual(['asi_4', 'asi_6', 'asi_8', 'asi_12', 'asi_14', 'asi_16']);
    expect(
      allGrants
        .filter((grant) => grant.type === 'weapon_mastery')
        .map((grant) => grant.choose),
    ).toEqual([3, 1, 1, 1]);
    expect(grantsAt(19).find((grant) => grant.key === 'epic_boon_19')).toMatchObject({
      type: 'feat_pick',
      choose: 1,
      category: 'epic',
    });
  });

  it('uses structured equipment and resolves every referenced item file', () => {
    expect(fighter.starting_equipment.groups).toHaveLength(1);
    expect(fighter.starting_equipment.groups[0].options).toHaveLength(2);
    expect(fighter.starting_equipment.goldAlternative).toBe(155);
    expectEquipmentItemsToExist(fighter.starting_equipment);
  });
});
