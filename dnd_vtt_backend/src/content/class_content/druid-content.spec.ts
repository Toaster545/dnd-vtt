import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface DruidContent extends ClassContent {
  spellcasting_ability: string;
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    cantrips_known: number;
    prepared_spells: number;
    spell_slots: Record<string, number>;
    class_specific: { wild_shape_uses: number };
  })[];
}

describe('Druid class content', () => {
  const druid = loadClassContent<DruidContent>('druid');

  it('uses the complete structured class shape and all 2024 subclasses', () => {
    expect(druid.index).toBe('druid');
    expect(druid.primary_abilities).toEqual(['wisdom']);
    expect(druid.spellcasting_ability).toBe('wisdom');
    expect(druid.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(druid);
    expect(druid.subclasses.map((subclass) => subclass.index)).toEqual([
      'land',
      'moon',
      'sea',
      'stars',
    ]);
    expect(
      druid.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') ===
            '3,6,10,14' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks exact 2024 cantrip, prepared-spell, and Wild Shape progressions', () => {
    expect(druid.levels.map((level) => level.cantrips_known)).toEqual([
      2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    ]);
    expect(druid.levels.map((level) => level.prepared_spells)).toEqual([
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ]);
    expect(
      druid.levels.map((level) => level.class_specific.wild_shape_uses),
    ).toEqual([0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4]);
  });

  it('declares full-caster spell slots through level 20', () => {
    expect(druid.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(druid.levels[9].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
    expect(druid.levels[19].spell_slots).toEqual({
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

  it('makes class skills and permanent Druid paths selectable', () => {
    expect(druid.skill_choices).toEqual({
      count: 2,
      from: [
        'Animal Handling',
        'Arcana',
        'Insight',
        'Medicine',
        'Nature',
        'Perception',
        'Religion',
        'Survival',
      ],
    });
    expect(
      druid.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 2 });

    const primalOrder = druid.levels[0].grants?.find(
      (grant) => grant.key === 'primal_order',
    );
    expect(primalOrder).toMatchObject({ type: 'choice', choose: 1 });
    expect(primalOrder?.options?.map((option) => option.name)).toEqual([
      'Magician',
      'Warden',
    ]);

    const elementalFury = druid.levels[6].grants?.find(
      (grant) => grant.key === 'elemental_fury',
    );
    expect(elementalFury).toMatchObject({ type: 'choice', choose: 1 });
    expect(elementalFury?.options?.map((option) => option.name)).toEqual([
      'Potent Spellcasting',
      'Primal Strike',
    ]);
  });

  it('models Wild Shape as one progressive partially restored resource', () => {
    const wildShape = druid.levels[1].grants?.find(
      (grant) => grant.key === 'druid-wild-shape',
    );
    expect(wildShape?.action).toEqual({
      activation: 'bonus_action',
      uses: {
        max: 2,
        maxByLevel: { '6': 3, '17': 4 },
        per: 'long_rest',
        shortRestRestore: 1,
      },
    });
    expect(
      druid.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'druid-wild-shape'),
    ).toHaveLength(1);
  });

  it('keeps rest- and activation-time subclass decisions out of saved choices', () => {
    const subclassChoices = druid.subclasses.flatMap((subclass) =>
      subclass.levels.flatMap((level) =>
        (level.grants ?? []).filter((grant) => grant.type === 'choice'),
      ),
    );
    expect(subclassChoices).toEqual([]);

    const land = druid.subclasses.find((subclass) => subclass.index === 'land');
    expect(land?.levels[0].grants?.[0]).toMatchObject({
      type: 'feature',
      name: 'Circle of the Land Spells',
    });

    const stars = druid.subclasses.find(
      (subclass) => subclass.index === 'stars',
    );
    expect(stars?.levels[0].grants?.[1]).toMatchObject({
      type: 'feature',
      name: 'Starry Form',
    });
  });

  it('uses ability-scaled resources for Moon and Stars features', () => {
    const moon = druid.subclasses.find((subclass) => subclass.index === 'moon');
    expect(
      moon?.levels[2].grants?.find((grant) => grant.key === 'moonlight-step')
        ?.action,
    ).toMatchObject({
      activation: 'bonus_action',
      uses: {
        maxAbilityModifier: 'wisdom',
        minimum: 1,
        per: 'long_rest',
      },
    });

    const stars = druid.subclasses.find(
      (subclass) => subclass.index === 'stars',
    );
    expect(
      stars?.levels[1].grants?.find((grant) => grant.key === 'cosmic-omen')
        ?.action,
    ).toMatchObject({
      activation: 'reaction',
      uses: {
        maxAbilityModifier: 'wisdom',
        minimum: 1,
        per: 'long_rest',
      },
    });
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(druid.starting_equipment.groups).toEqual([]);
    expect(druid.starting_equipment.gold).toBe(9);
    expect(druid.starting_equipment.goldAlternative).toBe(50);
    expect(
      druid.starting_equipment.fixed.map((reference) => reference.item),
    ).toEqual([
      'leather-armor',
      'shield',
      'sickle',
      'quarterstaff',
      'explorers-pack',
      'herbalism-kit',
    ]);
    expectEquipmentItemsToExist(druid.starting_equipment);
  });
});
