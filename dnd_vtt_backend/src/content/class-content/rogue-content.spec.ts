import {
  ClassContent,
  expectEquipmentItemsToExist,
  expectLevelsOneThroughTwenty,
  loadClassContent,
} from './class-content-test.utils';

interface RogueContent extends ClassContent {
  skill_choices: { count: number; from: string[] };
  weapon_proficiencies: string[];
  levels: (ClassContent['levels'][number] & {
    class_specific: {
      sneak_attack: string;
      weapon_masteries: number;
    };
  })[];
}

describe('Rogue class content', () => {
  const rogue = loadClassContent<RogueContent>('rogue');
  const subclass = (index: string) =>
    rogue.subclasses.find((entry) => entry.index === index);

  it('uses the complete 2024 class shape and all four subclasses', () => {
    expect(rogue.index).toBe('rogue');
    expect(rogue.primary_abilities).toEqual(['dexterity']);
    expect(rogue.subclass_level).toBe(3);
    expectLevelsOneThroughTwenty(rogue);
    expect(rogue.subclasses.map((entry) => entry.index)).toEqual([
      'arcane-trickster',
      'assassin',
      'soulknife',
      'thief',
    ]);

    for (const index of ['assassin', 'soulknife', 'thief']) {
      expect(subclass(index)?.levels.map((level) => level.level)).toEqual([
        3, 9, 13, 17,
      ]);
      expect(
        subclass(index)?.levels.every(
          (level) => (level.grants?.length ?? 0) > 0,
        ),
      ).toBe(true);
    }
  });

  it('tracks the exact Sneak Attack and Weapon Mastery progressions', () => {
    expect(
      rogue.levels.map((level) => level.class_specific.sneak_attack),
    ).toEqual([
      '1d6',
      '1d6',
      '2d6',
      '2d6',
      '3d6',
      '3d6',
      '4d6',
      '4d6',
      '5d6',
      '5d6',
      '6d6',
      '6d6',
      '7d6',
      '7d6',
      '8d6',
      '8d6',
      '9d6',
      '9d6',
      '10d6',
      '10d6',
    ]);
    expect(
      rogue.levels.map((level) => level.class_specific.weapon_masteries),
    ).toEqual(Array.from({ length: 20 }, () => 2));
  });

  it('makes skills, Expertise, a language, masteries, ASIs, and the Epic Boon selectable', () => {
    expect(rogue.skill_choices).toEqual({
      count: 4,
      from: [
        'Acrobatics',
        'Athletics',
        'Deception',
        'Insight',
        'Intimidation',
        'Investigation',
        'Perception',
        'Persuasion',
        'Sleight of Hand',
        'Stealth',
      ],
    });
    expect(
      rogue.levels[0].grants?.find((grant) => grant.key === 'skills'),
    ).toMatchObject({ type: 'skill_choice', choose: 4 });
    expect(
      rogue.levels[0].grants?.find((grant) => grant.key === 'expertise_1'),
    ).toMatchObject({ type: 'expertise_choice', choose: 2 });
    expect(
      rogue.levels[5].grants?.find((grant) => grant.key === 'expertise_6'),
    ).toMatchObject({ type: 'expertise_choice', choose: 2 });

    const language = rogue.levels[0].grants?.find(
      (grant) => grant.key === 'thieves_cant_language',
    );
    expect(language).toMatchObject({ type: 'choice', choose: 1 });
    expect(language?.options).toHaveLength(17);
    expect(
      language?.options?.every(
        (option) => option.effects?.[0]?.type === 'language_proficiency',
      ),
    ).toBe(true);

    expect(
      rogue.levels[0].grants?.find((grant) => grant.key === 'weapon_mastery'),
    ).toMatchObject({
      type: 'weapon_mastery',
      choose: 2,
      proficiency: [
        'Simple',
        'Martial Weapons with the Finesse or Light property',
      ],
    });

    for (const level of [4, 8, 10, 12, 16]) {
      expect(
        rogue.levels[level - 1].grants?.find(
          (grant) => grant.key === `asi_${level}`,
        ),
      ).toMatchObject({ type: 'ability_choice', points: 2 });
    }
    expect(
      rogue.levels[18].grants?.find((grant) => grant.key === 'epic_boon_19'),
    ).toMatchObject({ type: 'feat_pick', category: 'epic' });
  });

  it('scaffolds the complete Arcane Trickster progression without spell objects', () => {
    const arcaneTrickster = subclass('arcane-trickster');
    expect(arcaneTrickster?.levels.map((level) => level.level)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 3),
    );
    expect(arcaneTrickster?.levels[0]).toMatchObject({
      cantrips_known: 3,
      prepared_spells: 3,
      spell_slots: { '1': 2 },
    });
    expect(arcaneTrickster?.levels[7]).toMatchObject({
      cantrips_known: 4,
      prepared_spells: 7,
      spell_slots: { '1': 4, '2': 3 },
    });
    expect(arcaneTrickster?.levels[17]).toMatchObject({
      cantrips_known: 4,
      prepared_spells: 13,
      spell_slots: { '1': 4, '2': 3, '3': 3, '4': 1 },
    });
    expect(
      arcaneTrickster?.levels
        .filter((level) => level.features.length > 0)
        .map((level) => level.level),
    ).toEqual([3, 9, 13, 17]);
  });

  it('models short-rest, long-rest, and partially restored resources', () => {
    expect(
      rogue.levels[19].grants?.find((grant) => grant.key === 'stroke-of-luck')
        ?.action,
    ).toEqual({
      activation: 'free',
      uses: { max: 1, per: 'short_rest' },
    });

    expect(
      subclass('soulknife')?.levels[0].grants?.find(
        (grant) => grant.key === 'soulknife-psionic-energy-dice',
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

    for (const key of ['psychic-veil', 'rend-mind', 'spell-thief']) {
      const grant = rogue.subclasses
        .flatMap((entry) => entry.levels)
        .flatMap((level) => level.grants ?? [])
        .find((entry) => entry.key === key);
      expect(grant?.action?.uses).toMatchObject({
        max: 1,
        per: 'long_rest',
      });
    }
  });

  it('uses generic effects for saves, tools, and languages', () => {
    expect(
      rogue.levels[14].grants?.find((grant) => grant.name === 'Slippery Mind')
        ?.effects,
    ).toEqual([
      {
        type: 'saving_throw_proficiency',
        tags: ['wisdom', 'charisma'],
      },
    ]);
    expect(
      subclass('assassin')?.levels[0].grants?.find(
        (grant) => grant.name === "Assassin's Tools",
      )?.effects,
    ).toEqual([
      {
        type: 'tool_proficiency',
        tags: ['Disguise Kit', "Poisoner's Kit"],
      },
    ]);
    expect(
      rogue.levels[0].grants?.find((grant) => grant.name === "Thieves' Cant")
        ?.effects,
    ).toEqual([{ type: 'language_proficiency', tags: ["Thieves' Cant"] }]);
  });

  it('uses the structured 2024 starting-equipment package', () => {
    expect(rogue.starting_equipment.groups).toEqual([]);
    expect(rogue.starting_equipment.gold).toBe(8);
    expect(rogue.starting_equipment.goldAlternative).toBe(100);
    expect(
      rogue.starting_equipment.fixed.map((reference) => reference.item),
    ).toEqual([
      'leather-armor',
      'dagger',
      'shortsword',
      'shortbow',
      'arrows',
      'quiver',
      'thieves-tools',
      'burglars-pack',
    ]);
    expectEquipmentItemsToExist(rogue.starting_equipment);
  });
});
