import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface PaladinContent extends ClassContent {
  spellcasting_ability: string;
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    prepared_spells: number;
    spell_slots: Record<string, number>;
    class_specific: {
      channel_divinity: number;
      weapon_masteries: number;
    };
  })[];
}

describe('Paladin class content', () => {
  const paladin = loadClassContent<PaladinContent>('paladin');
  const subclass = (index: string) =>
    paladin.subclasses.find((entry) => entry.index === index);

  it('uses the complete 2024 class shape and all four oaths', () => {
    expect(paladin.index).toBe('paladin');
    expect(paladin.primary_abilities).toEqual(['strength', 'charisma']);
    expect(paladin.spellcasting_ability).toBe('charisma');
    expect(paladin.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(paladin);
    expect(paladin.subclasses.map((entry) => entry.index)).toEqual([
      'devotion',
      'glory',
      'ancients',
      'vengeance',
    ]);

    for (const index of ['devotion', 'glory', 'ancients', 'vengeance']) {
      expect(subclass(index)?.levels.map((level) => level.level)).toEqual([
        3, 7, 15, 20,
      ]);
      expect(
        subclass(index)?.levels.every(
          (level) => (level.grants?.length ?? 0) > 0,
        ),
      ).toBe(true);
    }
  });

  it('tracks exact prepared-spell, Channel Divinity, and mastery progressions', () => {
    expect(paladin.levels.map((level) => level.prepared_spells)).toEqual([
      2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
    ]);
    expect(
      paladin.levels.map((level) => level.class_specific.channel_divinity),
    ).toEqual([0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(
      paladin.levels.map((level) => level.class_specific.weapon_masteries),
    ).toEqual(Array.from({ length: 20 }, () => 2));
  });

  it('declares the complete half-caster slot progression from level 1', () => {
    expect(paladin.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(paladin.levels[4].spell_slots).toEqual({ '1': 4, '2': 2 });
    expect(paladin.levels[8].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 2,
    });
    expect(paladin.levels[12].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 1,
    });
    expect(paladin.levels[19].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
  });

  it('makes skills, Fighting Style, and two weapon masteries selectable', () => {
    expect(paladin.skill_choices).toEqual({
      count: 2,
      from: [
        'Athletics',
        'Insight',
        'Intimidation',
        'Medicine',
        'Persuasion',
        'Religion',
      ],
    });
    expect(
      paladin.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 2 });
    expect(
      paladin.levels[0].grants?.find((grant) => grant.key === 'weapon_mastery'),
    ).toMatchObject({ type: 'weapon_mastery', choose: 2 });
    expect(
      paladin.levels[1].grants?.find((grant) => grant.key === 'fighting_style'),
    ).toMatchObject({
      type: 'feat_pick',
      choose: 1,
      category: 'fighting_style',
    });
  });

  it('models Lay On Hands and Channel Divinity as progressive resources', () => {
    expect(
      paladin.levels[0].grants?.find((grant) => grant.key === 'lay-on-hands')
        ?.action,
    ).toMatchObject({
      activation: 'bonus_action',
      uses: {
        max: 5,
        maxByLevel: { '2': 10, '10': 50, '20': 100 },
        per: 'long_rest',
      },
    });

    const channelDivinity = paladin.levels[2].grants?.find(
      (grant) => grant.key === 'paladin-channel-divinity',
    );
    expect(channelDivinity?.action).toEqual({
      activation: 'free',
      uses: {
        max: 2,
        maxByLevel: { '11': 3 },
        per: 'long_rest',
        shortRestRestore: 1,
      },
    });
    expect(
      paladin.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'paladin-channel-divinity'),
    ).toHaveLength(1);
  });

  it('keeps oath spells structural and activation-time choices out of saved choices', () => {
    for (const index of ['devotion', 'glory', 'ancients', 'vengeance']) {
      expect(
        subclass(index)?.levels[0].grants?.some((grant) =>
          grant.name?.endsWith('Spells'),
        ),
      ).toBe(true);
    }
    expect(
      paladin.subclasses.flatMap((entry) =>
        entry.levels.flatMap((level) =>
          (level.grants ?? []).filter((grant) => grant.type === 'choice'),
        ),
      ),
    ).toEqual([]);
  });

  it('uses generic effects and ability-scaled oath resources', () => {
    expect(
      paladin.levels[5].grants?.find(
        (grant) => grant.name === 'Aura of Protection',
      )?.effects,
    ).toEqual([
      {
        type: 'saving_throw_ability_bonus',
        ability: 'charisma',
        minimum: 1,
      },
    ]);
    expect(
      subclass('glory')?.levels[2].grants?.find(
        (grant) => grant.key === 'glorious-defense',
      )?.action,
    ).toMatchObject({
      activation: 'reaction',
      uses: {
        maxAbilityModifier: 'charisma',
        minimum: 1,
        per: 'long_rest',
      },
    });
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(paladin.starting_equipment.groups).toEqual([]);
    expect(paladin.starting_equipment.gold).toBe(9);
    expect(paladin.starting_equipment.goldAlternative).toBe(150);
    expect(
      paladin.starting_equipment.fixed.map((reference) => reference.item),
    ).toEqual([
      'chain-mail',
      'shield',
      'longsword',
      'javelin',
      'holy-symbol',
      'priests-pack',
    ]);
    expectEquipmentItemsToExist(paladin.starting_equipment);
  });
});
