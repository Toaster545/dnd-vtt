import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface ArtificerContent extends ClassContent {
  name: string;
  hit_die: number;
  saving_throws: string[];
  armor_training: string[];
  weapon_proficiencies: string[];
  tool_proficiencies: string[];
  spellcasting_ability: string;
  spellcasting: {
    key: string;
    list: string;
    ability: string;
    mode: string;
    progression: string;
  };
  source: {
    book: string;
    edition: number;
    code: string;
    srd_5_2_1: boolean;
  };
  levels: (ClassContent['levels'][number] & {
    class_specific: { plans_known: number; replicated_items: number };
  })[];
}

describe('Artificer class content', () => {
  const artificer = loadClassContent<ArtificerContent>('artificer');
  const grantsAt = (level: number) =>
    artificer.levels.find((entry) => entry.level === level)?.grants ?? [];
  const subclass = (index: string) =>
    artificer.subclasses.find((entry) => entry.index === index);

  it('uses the released 2024-rules class shape and source metadata', () => {
    expect(artificer).toMatchObject({
      index: 'artificer',
      name: 'Artificer',
      primary_abilities: ['intelligence'],
      hit_die: 8,
      saving_throws: ['constitution', 'intelligence'],
      armor_training: ['Light Armor', 'Medium Armor', 'Shields'],
      weapon_proficiencies: ['Simple Weapons'],
      tool_proficiencies: ["Thieves' Tools", "Tinker's Tools"],
      spellcasting_ability: 'intelligence',
      subclass_level: 3,
      spellcasting: {
        key: 'class:artificer',
        list: 'Artificer',
        ability: 'intelligence',
        mode: 'prepared',
        progression: 'half',
      },
      source: {
        book: 'Eberron: Forge of the Artificer',
        edition: 2024,
        code: 'EFA',
        srd_5_2_1: false,
      },
    });
    expectLevelsOneThroughTwenty(artificer);
    expectEquipmentItemsToExist(artificer.starting_equipment);
  });

  it('tracks the exact spell and magic-item progression', () => {
    expect(artificer.levels.map((entry) => entry.cantrips_known)).toEqual([
      2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4,
    ]);
    expect(artificer.levels.map((entry) => entry.prepared_spells)).toEqual([
      2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
    ]);
    expect(
      artificer.levels.map((entry) => entry.class_specific.plans_known),
    ).toEqual([0, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8]);
    expect(
      artificer.levels.map((entry) => entry.class_specific.replicated_items),
    ).toEqual([0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6]);
    expect(artificer.levels[0].spell_slots).toEqual({ '1': 2 });
    expect(artificer.levels[19].spell_slots).toEqual({
      '1': 4,
      '2': 3,
      '3': 3,
      '4': 3,
      '5': 2,
    });
  });

  it("models level-one choices, Tinker's Magic, and progressive plans", () => {
    expect(grantsAt(1).find((grant) => grant.key === 'skills')).toMatchObject({
      type: 'skill_choice',
      choose: 2,
    });
    expect(
      grantsAt(1).find((grant) => grant.key === 'artisans_tools'),
    ).toMatchObject({ type: 'choice', choose: 1 });
    expect(
      grantsAt(1).find((grant) => grant.key === 'artificer-tinkers-magic')
        ?.action,
    ).toEqual({
      activation: 'action',
      uses: {
        max: 1,
        maxAbilityModifier: 'intelligence',
        minimum: 1,
        per: 'long_rest',
      },
    });

    const plans = grantsAt(2).find((grant) => grant.key === 'magic_item_plans');
    expect(plans).toMatchObject({
      type: 'choice',
      choose: 4,
      chooseByLevel: { '6': 5, '10': 6, '14': 7, '18': 8 },
    });
    expect(plans?.options).toHaveLength(56);
    expect(
      plans?.options?.find((option) => option.name === 'Armor +2')
        ?.prerequisite,
    ).toEqual({ level: 14 });
  });

  it('includes all five released subclasses at their feature levels', () => {
    expect(artificer.subclasses.map((entry) => entry.index)).toEqual([
      'alchemist',
      'armorer',
      'artillerist',
      'battle-smith',
      'cartographer',
    ]);
    for (const entry of artificer.subclasses) {
      expect(entry.levels.map((level) => level.level)).toEqual([3, 5, 9, 15]);
      expect(
        entry.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ).toBe(true);
    }
  });

  it('encodes each subclass defining choice or resource', () => {
    expect(
      subclass('armorer')
        ?.levels[0].grants?.find((grant) => grant.key === 'armor_model')
        ?.options?.map((option) => option.name),
    ).toEqual(['Dreadnaught', 'Guardian', 'Infiltrator']);
    expect(
      subclass('battle-smith')?.levels[2].grants?.find(
        (grant) => grant.key === 'battle-smith-arcane-jolt',
      )?.action?.uses,
    ).toMatchObject({
      maxAbilityModifier: 'intelligence',
      minimum: 1,
      per: 'long_rest',
    });
    expect(
      subclass('cartographer')?.levels[0].grants?.find(
        (grant) => grant.key === 'cartographer-illuminated-cartography',
      )?.action?.uses,
    ).toMatchObject({ maxAbilityModifier: 'intelligence' });
  });
});
