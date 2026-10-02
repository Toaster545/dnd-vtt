import { defaultCharacter } from '../models/character.model';
import { DndMonster } from '../services/content.service';
import { ComputedStats } from '../services/character-stats.service';
import {
  characterStatblock,
  monsterStatblock,
  statblockFileName,
  toYaml,
} from './statblock-export';

const goblin: DndMonster = {
  index: 'goblin',
  name: 'Goblin',
  size: 'Small',
  type: 'fey',
  alignment: 'chaotic neutral',
  armor_class: 15,
  armor_class_desc: 'leather armor, shield',
  hit_points: 10,
  hit_dice: '3d6',
  speed: { walk: 30, climb: 20 },
  ability_scores: {
    strength: 8,
    dexterity: 15,
    constitution: 10,
    intelligence: 10,
    wisdom: 8,
    charisma: 8,
  },
  skills: { Stealth: 6, 'Sleight of Hand': 4 },
  senses: { darkvision: 60, passive_perception: 9 },
  languages: ['Common', 'Goblin'],
  challenge_rating: '1/4',
  xp: 50,
  actions: [
    {
      name: 'Scimitar',
      description: 'Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.',
    },
  ],
};

describe('toYaml', () => {
  it('quotes strings as JSON scalars and nests lists of maps', () => {
    expect(
      toYaml({
        name: 'A: "b"',
        stats: [1, 2],
        traits: [{ name: 'x', desc: 'y' }],
        skip: undefined,
      }),
    ).toBe(
      [
        'name: "A: \\"b\\""',
        'stats:',
        '  - 1',
        '  - 2',
        'traits:',
        '  - name: "x"',
        '    desc: "y"',
      ].join('\n'),
    );
  });

  it('quotes keys that are not plain identifiers', () => {
    expect(toYaml({ spells: [{ '1st level (2 slots)': 'shield' }] })).toBe(
      'spells:\n  - "1st level (2 slots)": "shield"',
    );
  });
});

describe('monsterStatblock', () => {
  const out = monsterStatblock(goblin);

  it('wraps the YAML in a statblock fence', () => {
    expect(out.startsWith('```statblock\n')).toBe(true);
    expect(out.endsWith('\n```\n')).toBe(true);
  });

  it('maps core fields to the Fantasy Statblocks schema', () => {
    expect(out).toContain('ac: "15 (leather armor, shield)"');
    expect(out).toContain('speed: "30 ft., climb 20 ft."');
    expect(out).toContain('senses: "darkvision 60 ft., passive Perception 9"');
    expect(out).toContain('cr: "1/4"');
    expect(out).toContain('  - stealth: 6');
    expect(out).toContain('  - "sleight of hand": 4');
    expect(out).toContain('  - name: "Scimitar"');
  });

  it('omits empty optional sections', () => {
    expect(out).not.toContain('legendary_actions');
    expect(out).not.toMatch(/^saves:/m);
    expect(out).not.toContain('damage_immunities');
  });
});

describe('characterStatblock', () => {
  const stats = {
    proficiency_bonus: 2,
    saving_throw_proficient: new Set(['strength', 'constitution']),
    saving_throw_bonuses: {
      strength: 5,
      dexterity: 1,
      constitution: 4,
      intelligence: 0,
      wisdom: 1,
      charisma: -1,
    },
    skill_bonuses: { Athletics: 5 },
    passive_perception: 11,
    spell_save_dc: null,
    spell_attack_bonus: null,
    computed_ac: 18,
    unarmed_attack: {
      itemIndex: 'unarmed-strike',
      name: 'Unarmed Strike',
      distance: '5 ft. reach',
      attack_bonus: 5,
      damage_dice: '',
      damage_bonus: 3,
      damage_type: 'bludgeoning',
    },
    weapon_attacks: [
      {
        itemIndex: 'longsword',
        name: 'Longsword',
        distance: '5 ft. reach',
        attack_bonus: 5,
        damage_dice: '1d8',
        versatile_damage_dice: '1d10',
        damage_bonus: 3,
        damage_type: 'slashing',
      },
    ],
  } as unknown as ComputedStats;

  const out = characterStatblock({
    character: {
      ...defaultCharacter(),
      name: 'Brakka',
      race: 'Dwarf',
      class: 'Fighter',
      level: 1,
      skills: { Athletics: true },
    },
    stats,
    hitDice: '1d10',
    darkvisionFt: 120,
    features: [{ source: 'Fighter', name: 'Second Wind' }],
    actions: [
      {
        key: 'sw',
        name: 'Second Wind',
        activation: 'bonus_action',
        source: 'Fighter',
        maxUses: 2,
        usedUses: 0,
        per: 'long_rest',
        shortRestRestore: 1,
        unlimited: false,
      },
    ],
  });

  it('describes the character in the subtype', () => {
    expect(out).toContain('subtype: "Dwarf, Fighter 1"');
    expect(out).not.toMatch(/^cr:/m);
  });

  it('includes proficient saves and skills only', () => {
    expect(out).toContain('  - strength: 5\n  - constitution: 4');
    expect(out).toContain('  - athletics: 5');
    expect(out).not.toContain('dexterity: 1');
  });

  it('formats weapon attacks and tracked bonus actions', () => {
    expect(out).toContain(
      'Melee Attack Roll: +5, reach 5 ft. Hit: 1d8 + 3 Slashing damage, or 1d10 + 3 Slashing damage if used with two hands.',
    );
    expect(out).toContain('Hit: 3 Bludgeoning damage.');
    expect(out).toContain('bonus_actions:\n  - name: "Second Wind (2/Long Rest)"');
  });
});

describe('statblockFileName', () => {
  it('strips characters that are invalid in file names', () => {
    expect(statblockFileName('What/Is: This?')).toBe('WhatIs This.md');
  });
});
