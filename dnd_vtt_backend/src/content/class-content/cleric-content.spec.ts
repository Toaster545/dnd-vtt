import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface ClericContent extends ClassContent {
  spellcasting_ability: string;
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    cantrips_known: number;
    prepared_spells: number;
    spell_slots: Record<string, number>;
    class_specific: { channel_divinity: number };
  })[];
}

describe('Cleric class content', () => {
  const cleric = loadClassContent<ClericContent>('cleric');

  it('uses the complete structured class shape and all 2024 subclasses', () => {
    expect(cleric.index).toBe('cleric');
    expect(cleric.primary_abilities).toEqual(['wisdom']);
    expect(cleric.spellcasting_ability).toBe('wisdom');
    expect(cleric.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(cleric);
    expect(cleric.subclasses.map((subclass) => subclass.index)).toEqual([
      'life',
      'light',
      'trickery',
      'war',
    ]);
    expect(
      cleric.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') === '3,6,17' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks exact 2024 cantrip, prepared-spell, and Channel Divinity progressions', () => {
    expect(cleric.levels.map((level) => level.cantrips_known)).toEqual([
      3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    ]);
    expect(cleric.levels.map((level) => level.prepared_spells)).toEqual([
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ]);
    expect(
      cleric.levels.map((level) => level.class_specific.channel_divinity),
    ).toEqual([0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4]);
  });

  it('declares full-caster spell slots through level 20', () => {
    expect(cleric.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(cleric.levels[9].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
    expect(cleric.levels[19].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 3,
      '6': 2,
      '7': 2,
      '8': 1,
      '9': 1,
    });
  });

  it('makes class skills, Divine Order, and Blessed Strikes selectable', () => {
    expect(cleric.skill_choices).toEqual({
      count: 2,
      from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
    });
    expect(
      cleric.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 2 });

    const divineOrder = cleric.levels[0].grants?.find(
      (grant) => grant.key === 'divine_order',
    );
    expect(divineOrder).toMatchObject({ type: 'choice', choose: 1 });
    expect(divineOrder?.options?.map((option) => option.name)).toEqual([
      'Protector',
      'Thaumaturge',
    ]);
    expect(
      cleric.levels[6].grants?.find((grant) => grant.key === 'blessed_strikes'),
    ).toMatchObject({ type: 'choice', choose: 1 });
  });

  it('models Channel Divinity as one progressive partially restored resource', () => {
    const channelDivinity = cleric.levels[1].grants?.find(
      (grant) => grant.key === 'cleric-channel-divinity',
    );
    expect(channelDivinity?.action).toEqual({
      activation: 'action',
      uses: {
        max: 2,
        maxByLevel: { '6': 3, '18': 4 },
        per: 'long_rest',
        shortRestRestore: 1,
      },
    });
    expect(
      cleric.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'cleric-channel-divinity'),
    ).toHaveLength(1);
  });

  it('uses ability-scaled resources for Light and War domain features', () => {
    const light = cleric.subclasses.find(
      (subclass) => subclass.index === 'light',
    );
    expect(
      light?.levels[0].grants?.find((grant) => grant.key === 'warding-flare')
        ?.action,
    ).toMatchObject({
      activation: 'reaction',
      uses: {
        maxAbilityModifier: 'wisdom',
        minimum: 1,
        perByLevel: { '6': 'short_rest' },
      },
    });

    const war = cleric.subclasses.find((subclass) => subclass.index === 'war');
    expect(
      war?.levels[0].grants?.find((grant) => grant.key === 'war-priest')
        ?.action,
    ).toMatchObject({
      activation: 'bonus_action',
      uses: {
        maxAbilityModifier: 'wisdom',
        minimum: 1,
        per: 'short_rest',
      },
    });
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(cleric.starting_equipment.groups).toEqual([]);
    expect(cleric.starting_equipment.gold).toBe(7);
    expect(cleric.starting_equipment.goldAlternative).toBe(110);
    expect(
      cleric.starting_equipment.fixed.map((reference) => reference.item),
    ).toEqual(['chain-shirt', 'shield', 'mace', 'holy-symbol', 'priests-pack']);
    expectEquipmentItemsToExist(cleric.starting_equipment);
  });
});
