import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface SorcererContent extends ClassContent {
  spellcasting_ability: string;
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    cantrips_known: number;
    prepared_spells: number;
    spell_slots: Record<string, number>;
    class_specific: { sorcery_points: number };
  })[];
}

describe('Sorcerer class content', () => {
  const sorcerer = loadClassContent<SorcererContent>('sorcerer');

  it('uses the complete structured class shape and all 2024 subclasses', () => {
    expect(sorcerer.index).toBe('sorcerer');
    expect(sorcerer.primary_abilities).toEqual(['charisma']);
    expect(sorcerer.spellcasting_ability).toBe('charisma');
    expect(sorcerer.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(sorcerer);
    expect(sorcerer.subclasses.map((subclass) => subclass.index)).toEqual([
      'aberrant',
      'clockwork',
      'draconic',
      'wild-magic',
    ]);
    expect(
      sorcerer.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') ===
            '3,6,14,18' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks the exact 2024 spell and Sorcery Point progressions', () => {
    expect(sorcerer.levels.map((level) => level.cantrips_known)).toEqual([
      4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    ]);
    expect(sorcerer.levels.map((level) => level.prepared_spells)).toEqual([
      2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ]);
    expect(
      sorcerer.levels.map((level) => level.class_specific.sorcery_points),
    ).toEqual([
      0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it('declares full-caster spell slots through level 20', () => {
    expect(sorcerer.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(sorcerer.levels[9].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
    expect(sorcerer.levels[19].spell_slots).toEqual({
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

  it('models Sorcery Points as one progressive long-rest resource', () => {
    const font = sorcerer.levels[1].grants?.find(
      (grant) => grant.key === 'sorcery-points',
    );
    expect(font?.action).toMatchObject({
      activation: 'bonus_action',
      uses: {
        max: 2,
        maxByLevel: { '10': 10, '20': 20 },
        per: 'long_rest',
      },
    });
    expect(
      sorcerer.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'sorcery-points'),
    ).toHaveLength(1);
  });

  it('keeps Metamagic interactive and scales its total selections', () => {
    const metamagic = sorcerer.levels[1].grants?.find(
      (grant) => grant.key === 'metamagic',
    );
    expect(metamagic).toMatchObject({
      type: 'choice',
      choose: 2,
      chooseByLevel: { '10': 4, '17': 6 },
    });
    expect(metamagic?.options).toHaveLength(10);
  });

  it('makes skill and Draconic elemental choices selectable', () => {
    expect(sorcerer.skill_choices).toEqual({
      count: 2,
      from: [
        'Arcana',
        'Deception',
        'Insight',
        'Intimidation',
        'Persuasion',
        'Religion',
      ],
    });
    expect(
      sorcerer.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 2 });

    const draconic = sorcerer.subclasses.find(
      (subclass) => subclass.index === 'draconic',
    );
    expect(
      draconic?.levels[1].grants?.find(
        (grant) => grant.key === 'elemental-affinity',
      ),
    ).toMatchObject({ type: 'choice', choose: 1 });
  });

  it('expresses Draconic Resilience as generic effects', () => {
    const draconic = sorcerer.subclasses.find(
      (subclass) => subclass.index === 'draconic',
    );
    const effects = draconic?.levels[0].grants?.flatMap(
      (grant) => grant.effects ?? [],
    );
    expect(effects).toEqual(
      expect.arrayContaining([
        { type: 'hp_bonus_per_level', value: 1 },
        {
          type: 'unarmored_defense',
          tags: ['charisma'],
          condition: 'no_armor',
        },
      ]),
    );
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(sorcerer.starting_equipment.groups).toEqual([]);
    expect(sorcerer.starting_equipment.gold).toBe(28);
    expect(sorcerer.starting_equipment.goldAlternative).toBe(50);
    expect(
      sorcerer.starting_equipment.fixed.find((ref) => ref.item === 'dagger')
        ?.quantity,
    ).toBe(2);
    expectEquipmentItemsToExist(sorcerer.starting_equipment);
  });
});
