import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface BardContent extends ClassContent {
  spellcasting_ability: string;
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    cantrips_known: number;
    prepared_spells: number;
    spell_slots: Record<string, number>;
    class_specific: { bardic_die: string };
  })[];
}

describe('Bard class content', () => {
  const bard = loadClassContent<BardContent>('bard');

  it('uses the complete structured class shape and all 2024 subclasses', () => {
    expect(bard.index).toBe('bard');
    expect(bard.primary_abilities).toEqual(['charisma']);
    expect(bard.spellcasting_ability).toBe('charisma');
    expect(bard.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(bard);
    expect(bard.subclasses.map((subclass) => subclass.index)).toEqual([
      'dance',
      'glamour',
      'lore',
      'valor',
    ]);
    expect(
      bard.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') === '3,6,14' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks the exact 2024 cantrip, prepared-spell, and Bardic Die progressions', () => {
    expect(bard.levels.map((level) => level.cantrips_known)).toEqual([
      2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    ]);
    expect(bard.levels.map((level) => level.prepared_spells)).toEqual([
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ]);
    expect(bard.levels.map((level) => level.class_specific.bardic_die)).toEqual(
      [
        'd6',
        'd6',
        'd6',
        'd6',
        'd8',
        'd8',
        'd8',
        'd8',
        'd8',
        'd10',
        'd10',
        'd10',
        'd10',
        'd10',
        'd12',
        'd12',
        'd12',
        'd12',
        'd12',
        'd12',
      ],
    );
  });

  it('declares full-caster spell slots through level 20', () => {
    expect(bard.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(bard.levels[9].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
    expect(bard.levels[19].spell_slots).toEqual({
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

  it('models Bardic Inspiration as one ability-scaled progressive resource', () => {
    const inspiration = bard.levels[0].grants?.find(
      (grant) => grant.key === 'bardic-inspiration',
    );
    expect(inspiration?.action).toEqual({
      activation: 'bonus_action',
      uses: {
        max: 1,
        maxAbilityModifier: 'charisma',
        minimum: 1,
        per: 'long_rest',
        perByLevel: { '5': 'short_rest' },
      },
    });
    expect(
      bard.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'bardic-inspiration'),
    ).toHaveLength(1);
  });

  it('makes Bard and College of Lore proficiencies selectable', () => {
    expect(bard.skill_choices.count).toBe(3);
    expect(bard.skill_choices.from).toHaveLength(18);
    expect(
      bard.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({
      type: 'skill_choice',
      choose: 3,
    });
    expect(
      bard.levels[0].grants?.find(
        (grant) => grant.key === 'musical_instruments',
      ),
    ).toMatchObject({ type: 'choice', choose: 3 });
    expect(
      bard.levels[1].grants?.find((grant) => grant.key === 'expertise_2'),
    ).toMatchObject({ type: 'expertise_choice', choose: 2 });
    expect(
      bard.levels[8].grants?.find((grant) => grant.key === 'expertise_9'),
    ).toMatchObject({ type: 'expertise_choice', choose: 2 });

    const lore = bard.subclasses.find((subclass) => subclass.index === 'lore');
    expect(
      lore?.levels[0].grants?.find(
        (grant) => grant.key === 'lore_bonus_skills',
      ),
    ).toMatchObject({ type: 'skill_choice', choose: 3 });
  });

  it('expresses Dance defense and Valor training as generic effects', () => {
    const dance = bard.subclasses.find(
      (subclass) => subclass.index === 'dance',
    );
    const danceEffects = dance?.levels[0].grants?.flatMap(
      (grant) => grant.effects ?? [],
    );
    expect(danceEffects).toContainEqual({
      type: 'unarmored_defense',
      tags: ['charisma'],
      condition: 'no_armor_or_shield',
    });

    const valor = bard.subclasses.find(
      (subclass) => subclass.index === 'valor',
    );
    const valorEffects = valor?.levels[0].grants?.flatMap(
      (grant) => grant.effects ?? [],
    );
    expect(valorEffects).toEqual(
      expect.arrayContaining([
        { type: 'weapon_proficiency', tags: ['martial'] },
        { type: 'armor_proficiency', tags: ['medium', 'shield'] },
      ]),
    );
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(bard.starting_equipment.groups).toEqual([]);
    expect(bard.starting_equipment.gold).toBe(19);
    expect(bard.starting_equipment.goldAlternative).toBe(90);
    expect(
      bard.starting_equipment.fixed.find((ref) => ref.item === 'dagger')
        ?.quantity,
    ).toBe(2);
    expectEquipmentItemsToExist(bard.starting_equipment);
  });
});
