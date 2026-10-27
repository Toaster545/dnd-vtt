import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface FighterContent extends ClassContent {
  armor_training: string[];
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    class_specific: {
      second_wind: number;
      weapon_masteries: number;
    };
  })[];
}

describe('Fighter class content', () => {
  const fighter = loadClassContent<FighterContent>('fighter');
  const grantsAt = (level: number) =>
    fighter.levels.find((entry) => entry.level === level)?.grants ?? [];
  const subclass = (index: string) =>
    fighter.subclasses.find((entry) => entry.index === index);

  it('uses the complete 2024 class shape and all four subclasses', () => {
    expect(fighter.index).toBe('fighter');
    expect(fighter.primary_abilities).toEqual(['strength', 'dexterity']);
    expect(fighter.armor_training).toEqual([
      'Light Armor',
      'Medium Armor',
      'Heavy Armor',
      'Shields',
    ]);
    expect(fighter.skill_choices).toEqual({
      count: 2,
      from: [
        'Acrobatics',
        'Animal Handling',
        'Athletics',
        'History',
        'Insight',
        'Intimidation',
        'Persuasion',
        'Perception',
        'Survival',
      ],
    });
    expect(fighter.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(fighter);
    expect(fighter.subclasses.map((entry) => entry.index)).toEqual([
      'champion',
      'battle-master',
      'eldritch-knight',
      'psi-warrior',
    ]);
  });

  it('uses the correct Fighter subclass feature levels', () => {
    for (const index of ['champion', 'battle-master', 'psi-warrior']) {
      expect(subclass(index)?.levels.map((level) => level.level)).toEqual([
        3, 7, 10, 15, 18,
      ]);
      expect(
        subclass(index)?.levels.every(
          (level) => (level.grants?.length ?? 0) > 0,
        ),
      ).toBe(true);
    }

    expect(
      subclass('eldritch-knight')
        ?.levels.filter((level) => level.features.length > 0)
        .map((level) => level.level),
    ).toEqual([3, 7, 10, 15, 18]);
  });

  it('tracks exact Second Wind and Weapon Mastery progressions', () => {
    expect(
      fighter.levels.map((level) => level.class_specific.second_wind),
    ).toEqual([2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(
      fighter.levels.map((level) => level.class_specific.weapon_masteries),
    ).toEqual([3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6]);
  });

  it('declares every level-1 choice and progressive Second Wind resource', () => {
    expect(grantsAt(1).find((grant) => grant.key === 'skills')).toMatchObject({
      type: 'skill_choice',
      choose: 2,
    });
    expect(
      grantsAt(1).find((grant) => grant.key === 'fighting_style'),
    ).toMatchObject({
      type: 'feat_pick',
      choose: 1,
      category: 'fighting_style',
    });
    expect(
      grantsAt(1).find((grant) => grant.key === 'weapon_mastery'),
    ).toMatchObject({ type: 'weapon_mastery', choose: 3 });
    expect(
      grantsAt(1).find((grant) => grant.key === 'second-wind')?.action,
    ).toEqual({
      activation: 'bonus_action',
      uses: {
        max: 2,
        maxByLevel: { '4': 3, '10': 4 },
        per: 'long_rest',
        shortRestRestore: 1,
      },
    });
  });

  it('uses the 2024 Tactical Mind and one progressive Indomitable resource', () => {
    const tacticalMind = grantsAt(2).find(
      (grant) => grant.type === 'feature' && grant.name === 'Tactical Mind',
    );
    expect(tacticalMind?.description).toContain('1d10');
    expect(tacticalMind?.description).toContain('not expended');

    const indomitable = grantsAt(9).find(
      (grant) => grant.key === 'fighter-indomitable',
    );
    expect(indomitable?.action).toEqual({
      activation: 'free',
      uses: {
        max: 1,
        maxByLevel: { '13': 2, '17': 3 },
        per: 'long_rest',
      },
    });
    expect(indomitable?.description).toContain(
      'bonus equal to your Fighter level',
    );
    expect(
      fighter.levels
        .flatMap((level) => level.grants ?? [])
        .filter((grant) => grant.key === 'fighter-indomitable'),
    ).toHaveLength(1);
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

  it('models Battle Master maneuvers, Student of War, and dice progression', () => {
    const battleMaster = subclass('battle-master');
    const level3 = battleMaster?.levels[0].grants ?? [];
    const superiorityDice = level3.find(
      (grant) => grant.key === 'battle-master-superiority-dice',
    );
    expect(superiorityDice?.action).toEqual({
      activation: 'free',
      uses: {
        max: 4,
        maxByLevel: { '7': 5, '15': 6 },
        per: 'short_rest',
      },
    });

    const maneuvers = level3.find((grant) => grant.key === 'combat_maneuvers');
    expect(maneuvers).toMatchObject({
      type: 'choice',
      choose: 3,
      chooseByLevel: { '7': 5, '10': 7, '15': 9 },
    });
    expect(maneuvers?.options).toHaveLength(20);
    expect(maneuvers?.options?.map((option) => option.name)).toContain(
      'Commanding Presence',
    );
    expect(maneuvers?.options?.map((option) => option.name)).toContain(
      'Tactical Assessment',
    );
    expect(maneuvers?.options?.map((option) => option.name)).not.toContain(
      'Brace',
    );

    expect(
      level3.find((grant) => grant.key === 'student_of_war_tools'),
    ).toMatchObject({ type: 'choice', choose: 1 });
    expect(
      level3.find((grant) => grant.key === 'student_of_war_skill'),
    ).toMatchObject({ type: 'skill_choice', choose: 1 });
  });

  it('sets up the complete Eldritch Knight spell and feature progression', () => {
    const eldritchKnight = subclass('eldritch-knight');
    expect(eldritchKnight?.levels.map((level) => level.cantrips_known)).toEqual(
      [2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    );
    expect(
      eldritchKnight?.levels.map((level) => level.prepared_spells),
    ).toEqual([3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13]);
    expect(eldritchKnight?.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(eldritchKnight?.levels[17].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 1,
    });
    expect(eldritchKnight?.levels[0].features).toEqual([
      'Spellcasting',
      'War Bond',
    ]);
    expect(eldritchKnight?.levels[12].features).toEqual(['Arcane Charge']);
    expect(eldritchKnight?.levels[15].features).toEqual(['Improved War Magic']);
  });

  it('models the progressive Psi Warrior pool and restored powers', () => {
    const psiWarrior = subclass('psi-warrior');
    expect(
      psiWarrior?.levels[0].grants?.find(
        (grant) => grant.key === 'psi-warrior-energy-dice',
      )?.action,
    ).toEqual({
      activation: 'free',
      uses: {
        max: 4,
        maxByLevel: { '5': 6, '9': 8, '13': 10, '17': 12 },
        per: 'long_rest',
        shortRestRestore: 1,
      },
    });
    expect(psiWarrior?.levels[1].grants?.map((grant) => grant.name)).toEqual([
      'Psi-Powered Leap',
      'Telekinetic Thrust',
    ]);
    expect(
      psiWarrior?.levels[3].grants?.find(
        (grant) => grant.key === 'bulwark-of-force',
      )?.action,
    ).toMatchObject({ activation: 'bonus_action' });
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
    expect(
      grantsAt(19).find((grant) => grant.key === 'epic_boon_19'),
    ).toMatchObject({
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
