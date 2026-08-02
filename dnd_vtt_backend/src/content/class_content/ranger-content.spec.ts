import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface RangerContent extends ClassContent {
  spellcasting_ability: string;
  skill_choices: { count: number; from: string[] };
  levels: (ClassContent['levels'][number] & {
    prepared_spells: number;
    spell_slots: Record<string, number>;
    class_specific: {
      favored_enemy_uses: number;
      weapon_masteries: number;
    };
  })[];
}

describe('Ranger class content', () => {
  const ranger = loadClassContent<RangerContent>('ranger');
  const subclass = (index: string) =>
    ranger.subclasses.find((entry) => entry.index === index);

  it('uses the complete 2024 class shape and all four subclasses', () => {
    expect(ranger.index).toBe('ranger');
    expect(ranger.primary_abilities).toEqual(['dexterity', 'wisdom']);
    expect(ranger.spellcasting_ability).toBe('wisdom');
    expect(ranger.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(ranger);
    expect(ranger.subclasses.map((entry) => entry.index)).toEqual([
      'beast-master',
      'fey-wanderer',
      'gloom-stalker',
      'hunter',
    ]);

    for (const index of [
      'beast-master',
      'fey-wanderer',
      'gloom-stalker',
      'hunter',
    ]) {
      expect(subclass(index)?.levels.map((level) => level.level)).toEqual([
        3, 7, 11, 15,
      ]);
      expect(
        subclass(index)?.levels.every(
          (level) => (level.grants?.length ?? 0) > 0,
        ),
      ).toBe(true);
    }
  });

  it('tracks exact prepared-spell, Favored Enemy, and mastery progressions', () => {
    expect(ranger.levels.map((level) => level.prepared_spells)).toEqual([
      2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
    ]);
    expect(
      ranger.levels.map((level) => level.class_specific.favored_enemy_uses),
    ).toEqual([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
    expect(
      ranger.levels.map((level) => level.class_specific.weapon_masteries),
    ).toEqual(Array.from({ length: 20 }, () => 2));
  });

  it('declares the complete half-caster slot progression from level 1', () => {
    expect(ranger.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(ranger.levels[4].spell_slots).toEqual({ '1': 4, '2': 2 });
    expect(ranger.levels[8].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 2,
    });
    expect(ranger.levels[12].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 1,
    });
    expect(ranger.levels[19].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
  });

  it('makes skills, Expertise, languages, Fighting Style, and masteries selectable', () => {
    expect(ranger.skill_choices).toEqual({
      count: 3,
      from: [
        'Animal Handling',
        'Athletics',
        'Insight',
        'Investigation',
        'Nature',
        'Perception',
        'Stealth',
        'Survival',
      ],
    });
    expect(
      ranger.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 3 });
    expect(
      ranger.levels[0].grants?.find((grant) => grant.key === 'weapon_mastery'),
    ).toMatchObject({ type: 'weapon_mastery', choose: 2 });
    expect(
      ranger.levels[1].grants?.find(
        (grant) => grant.key === 'deft_explorer_expertise',
      ),
    ).toMatchObject({ type: 'expertise_choice', choose: 1 });
    expect(
      ranger.levels[8].grants?.find((grant) => grant.key === 'expertise_9'),
    ).toMatchObject({ type: 'expertise_choice', choose: 2 });
    expect(
      ranger.levels[1].grants?.find(
        (grant) => grant.key === 'deft_explorer_languages',
      ),
    ).toMatchObject({ type: 'choice', choose: 2 });
    expect(
      ranger.levels[1].grants?.find((grant) => grant.key === 'fighting_style'),
    ).toMatchObject({
      type: 'feat_pick',
      choose: 1,
      category: 'fighting_style',
    });
  });

  it('models Favored Enemy and Wisdom-scaled features as finite resources', () => {
    expect(
      ranger.levels[0].grants?.find((grant) => grant.key === 'favored-enemy')
        ?.action,
    ).toEqual({
      activation: 'bonus_action',
      uses: {
        max: 2,
        maxByLevel: { '5': 3, '9': 4, '13': 5, '17': 6 },
        per: 'long_rest',
      },
    });

    for (const key of ['tireless', 'natures-veil']) {
      expect(
        ranger.levels
          .flatMap((level) => level.grants ?? [])
          .find((grant) => grant.key === key)?.action?.uses,
      ).toMatchObject({
        maxAbilityModifier: 'wisdom',
        minimum: 1,
        per: 'long_rest',
      });
    }
    expect(
      subclass('gloom-stalker')?.levels[0].grants?.find(
        (grant) => grant.key === 'dreadful-strike',
      )?.action?.uses,
    ).toMatchObject({
      maxAbilityModifier: 'wisdom',
      minimum: 1,
      per: 'long_rest',
    });
  });

  it('keeps subclass spells structural and rest-time tactics out of saved choices', () => {
    for (const index of ['fey-wanderer', 'gloom-stalker']) {
      expect(
        subclass(index)?.levels[0].grants?.some((grant) =>
          grant.name?.endsWith('Spells'),
        ),
      ).toBe(true);
    }
    for (const index of ['beast-master', 'hunter']) {
      expect(
        subclass(index)
          ?.levels.flatMap((level) => level.grants ?? [])
          .filter((grant) => grant.type === 'choice'),
      ).toEqual([]);
    }
  });

  it('uses generic effects for movement, initiative, saves, skills, and languages', () => {
    expect(
      ranger.levels[5].grants?.find((grant) => grant.name === 'Roving')
        ?.effects,
    ).toEqual([
      { type: 'speed_bonus', value: 10, condition: 'no_heavy_armor' },
    ]);
    expect(
      subclass('gloom-stalker')?.levels[0].grants?.find(
        (grant) => grant.name === 'Dread Ambusher',
      )?.effects,
    ).toEqual([{ type: 'initiative_ability_bonus', ability: 'wisdom' }]);
    expect(
      subclass('gloom-stalker')?.levels[1].grants?.find(
        (grant) => grant.name === 'Iron Mind',
      )?.effects,
    ).toEqual([{ type: 'saving_throw_proficiency', tags: ['wisdom'] }]);

    const languages = ranger.levels[1].grants?.find(
      (grant) => grant.key === 'deft_explorer_languages',
    );
    expect(languages?.options).toHaveLength(18);
    expect(
      languages?.options?.every(
        (option) => option.effects?.[0]?.type === 'language_proficiency',
      ),
    ).toBe(true);
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(ranger.starting_equipment.groups).toEqual([]);
    expect(ranger.starting_equipment.gold).toBe(7);
    expect(ranger.starting_equipment.goldAlternative).toBe(150);
    expect(
      ranger.starting_equipment.fixed.map((reference) => reference.item),
    ).toEqual([
      'studded-leather-armor',
      'scimitar',
      'shortsword',
      'longbow',
      'arrows',
      'quiver',
      'druidic-focus-mistletoe',
      'explorers-pack',
    ]);
    expectEquipmentItemsToExist(ranger.starting_equipment);
  });
});
