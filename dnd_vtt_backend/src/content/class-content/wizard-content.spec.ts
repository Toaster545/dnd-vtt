import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface WizardContent extends ClassContent {
  spellcasting_ability: string;
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    cantrips_known: number;
    spells_known: number;
    prepared_spells: number;
    spell_slots: Record<string, number>;
  })[];
}

describe('Wizard class content', () => {
  const wizard = loadClassContent<WizardContent>('wizard');

  it('uses the complete structured class shape and all 2024 subclasses', () => {
    expect(wizard.index).toBe('wizard');
    expect(wizard.primary_abilities).toEqual(['intelligence']);
    expect(wizard.spellcasting_ability).toBe('intelligence');
    expect(wizard.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(wizard);
    expect(wizard.subclasses.map((subclass) => subclass.index)).toEqual([
      'abjuration',
      'divination',
      'evocation',
      'illusion',
    ]);
    expect(
      wizard.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') ===
            '3,6,10,14' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks the exact 2024 cantrip and prepared-spell progressions', () => {
    expect(wizard.levels.map((level) => level.cantrips_known)).toEqual([
      3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    ]);
    expect(wizard.levels.map((level) => level.prepared_spells)).toEqual([
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25,
    ]);
    expect(wizard.levels.map((level) => level.spells_known)).toEqual([
      6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42,
      44,
    ]);
  });

  it('declares full-caster spell slots through level 20', () => {
    expect(wizard.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(wizard.levels[9].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
    expect(wizard.levels[19].spell_slots).toEqual({
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

  it('makes Wizard skills and Scholar expertise selectable', () => {
    expect(wizard.skill_choices).toEqual({
      count: 2,
      from: [
        'Arcana',
        'History',
        'Insight',
        'Investigation',
        'Medicine',
        'Nature',
        'Religion',
      ],
    });
    expect(
      wizard.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 2 });
    expect(
      wizard.levels[1].grants?.find(
        (grant) => grant.key === 'scholar_expertise',
      ),
    ).toMatchObject({
      type: 'expertise_choice',
      choose: 1,
      skills: [
        'Arcana',
        'History',
        'Investigation',
        'Medicine',
        'Nature',
        'Religion',
      ],
    });
  });

  it('models Arcane Recovery and progressive Portent resources', () => {
    expect(
      wizard.levels[0].grants?.find((grant) => grant.key === 'arcane-recovery')
        ?.action,
    ).toEqual({
      activation: 'free',
      uses: { max: 1, per: 'long_rest' },
    });

    const diviner = wizard.subclasses.find(
      (subclass) => subclass.index === 'divination',
    );
    expect(
      diviner?.levels[0].grants?.find((grant) => grant.key === 'portent')
        ?.action,
    ).toMatchObject({
      activation: 'free',
      uses: {
        max: 2,
        maxByLevel: { '14': 3 },
        per: 'long_rest',
      },
    });
  });

  it('tracks both independent Phantasmal Creatures free castings', () => {
    const illusionist = wizard.subclasses.find(
      (subclass) => subclass.index === 'illusion',
    );
    const levelSixActions = illusionist?.levels[1].grants?.filter(
      (grant) => grant.action,
    );
    expect(levelSixActions?.map((grant) => grant.key)).toEqual([
      'phantasmal-summon-beast',
      'phantasmal-summon-fey',
    ]);
    expect(
      levelSixActions?.every(
        (grant) => grant.action?.uses?.per === 'long_rest',
      ),
    ).toBe(true);
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(wizard.starting_equipment.groups).toEqual([]);
    expect(wizard.starting_equipment.gold).toBe(5);
    expect(wizard.starting_equipment.goldAlternative).toBe(55);
    expect(
      wizard.starting_equipment.fixed.find((ref) => ref.item === 'dagger')
        ?.quantity,
    ).toBe(2);
    expect(wizard.starting_equipment.fixed.map((ref) => ref.item)).toEqual(
      expect.arrayContaining([
        'arcane-focus-quarterstaff',
        'robe',
        'spellbook',
        'scholars-pack',
      ]),
    );
    expectEquipmentItemsToExist(wizard.starting_equipment);
  });
});
