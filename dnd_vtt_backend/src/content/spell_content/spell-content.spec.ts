import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { buildSpellAccess, buildSpellLists } from '../spell-access';

interface SpellContent {
  index: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string[];
  material?: string;
  material_cost_cp?: number;
  material_consumed?: boolean;
  duration: string;
  ritual: boolean;
  concentration: boolean;
  mechanics: {
    spell_attacks?: string[];
    saving_throws: string[];
    ability_checks: string[];
    damage_types: string[];
    conditions: string[];
    affects_creature_types: string[];
    grants_damage_immunities: string[];
    grants_damage_resistances: string[];
    grants_damage_vulnerabilities: string[];
    grants_condition_immunities: string[];
    area_tags: string[];
    misc_tags: string[];
    scaling?: { label: string; values: Record<string, string> };
  };
  description: string;
  higher_levels?: string;
  cantrip_upgrade?: string;
  source: {
    book: string;
    edition: number;
    code: string;
    page: number;
    srd_5_2_1: boolean;
    srd_name?: string;
    rules_text: 'SRD 5.2.1' | 'reference-only';
  };
}

interface SpellManifest {
  total: number;
  srd_5_2_1_rules_text: number;
  reference_only: number;
  spells: { index: string; name: string; level: number }[];
}

const contentRoot = join(process.cwd(), 'content');
const spellsRoot = join(contentRoot, 'spells');
const referenceOnlySummaries = JSON.parse(
  readFileSync(
    join(process.cwd(), 'scripts', 'reference-only-spell-summaries.json'),
    'utf8',
  ),
) as Record<string, string>;
const spellFiles = readdirSync(spellsRoot)
  .filter((file) => file.endsWith('.json'))
  .sort();
const spells = spellFiles.map(
  (file) =>
    JSON.parse(readFileSync(join(spellsRoot, file), 'utf8')) as SpellContent,
);
const providerFiles = (folder: string) =>
  readdirSync(join(contentRoot, folder))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map(
      (file) =>
        JSON.parse(
          readFileSync(join(contentRoot, folder, file), 'utf8'),
        ) as Record<string, unknown>,
    );
const classes = providerFiles('classes');
const races = providerFiles('races');
const backgrounds = providerFiles('backgrounds');
const feats = providerFiles('feats');
const spellLists = buildSpellLists(classes);
const spellAccess = buildSpellAccess(
  spells as unknown as Record<string, unknown>[],
  classes,
  races,
  backgrounds,
  feats,
);
const phbSpells = spells.filter((spell) => spell.source.code === 'XPHB');
const supplementalSpells = spells.filter(
  (spell) => spell.source.code !== 'XPHB',
);
const manifest = JSON.parse(
  readFileSync(join(contentRoot, 'manifests', 'phb-2024-spells.json'), 'utf8'),
) as SpellManifest;

interface AutomaticSpellGrant {
  type: 'spell_grant';
  key: string;
  spells?: string[];
}

function automaticSpellGrants(value: unknown): AutomaticSpellGrant[] {
  if (Array.isArray(value)) return value.flatMap(automaticSpellGrants);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    ...(record['type'] === 'spell_grant'
      ? [record as unknown as AutomaticSpellGrant]
      : []),
    ...Object.values(record).flatMap(automaticSpellGrants),
  ];
}

function contentFile(folder: string, index: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(contentRoot, folder, `${index}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

describe("Player's Handbook 2024 spell content", () => {
  it('contains the exact 391-spell PHB catalog and manifest', () => {
    expect(phbSpells).toHaveLength(391);
    expect(manifest.total).toBe(391);
    expect(manifest.spells).toHaveLength(391);
    expect(manifest.spells.map((spell) => spell.index).sort()).toEqual(
      phbSpells.map((spell) => spell.index).sort(),
    );
    expect(new Set(spells.map((spell) => spell.index)).size).toBe(
      spells.length,
    );
    expect(new Set(spells.map((spell) => spell.name)).size).toBe(spells.length);
  });

  it('includes the supplemental Artificer spell outside the PHB manifest', () => {
    expect(supplementalSpells).toHaveLength(1);
    expect(supplementalSpells[0]).toMatchObject({
      index: 'homunculus-servant',
      level: 2,
      ritual: true,
      source: {
        book: 'Eberron: Forge of the Artificer',
        edition: 2024,
        code: 'EFA',
        srd_5_2_1: false,
        rules_text: 'reference-only',
      },
    });
  });

  it('encodes every PHB species and feat that automatically grants spells', () => {
    for (const species of ['gnome', 'elf', 'tiefling', 'aasimar']) {
      expect(
        automaticSpellGrants(contentFile('races', species)).length,
      ).toBeGreaterThan(0);
    }
    for (const feat of [
      'magic-initiate',
      'fey-touched',
      'shadow-touched',
      'blessed-warrior',
      'druidic-warrior',
      'ritual-caster',
      'spell-sniper',
      'telekinetic',
      'telepathic',
    ]) {
      expect(
        automaticSpellGrants(contentFile('feats', feat)).length,
      ).toBeGreaterThan(0);
    }
  });

  it('encodes automatic class spells and every spell-bearing PHB subclass', () => {
    const classes = [
      'barbarian',
      'bard',
      'cleric',
      'druid',
      'fighter',
      'monk',
      'paladin',
      'ranger',
      'rogue',
      'sorcerer',
      'warlock',
      'wizard',
      'artificer',
    ];
    for (const classIndex of classes) {
      expect(
        automaticSpellGrants(contentFile('classes', classIndex)).length,
      ).toBeGreaterThan(0);
    }

    const fighter = contentFile('classes', 'fighter') as {
      subclasses: { index: string; spellcasting?: unknown }[];
    };
    const rogue = contentFile('classes', 'rogue') as {
      subclasses: { index: string; spellcasting?: unknown }[];
    };
    expect(
      fighter.subclasses.find(
        (subclass) => subclass.index === 'eldritch-knight',
      )?.spellcasting,
    ).toBeDefined();
    expect(
      rogue.subclasses.find((subclass) => subclass.index === 'arcane-trickster')
        ?.spellcasting,
    ).toBeDefined();
  });

  it('keeps every fixed automatic spell reference linked to the PHB catalog', () => {
    const spellIndexes = new Set(spells.map((spell) => spell.index));
    const folders = ['races', 'classes', 'feats'];
    const missing = folders.flatMap((folder) =>
      readdirSync(join(contentRoot, folder))
        .filter((file) => file.endsWith('.json'))
        .flatMap((file) =>
          automaticSpellGrants(
            JSON.parse(readFileSync(join(contentRoot, folder, file), 'utf8')),
          ).flatMap((grant) =>
            (grant.spells ?? [])
              .filter((index) => !spellIndexes.has(index))
              .map((index) => `${folder}/${file}:${grant.key}:${index}`),
          ),
        ),
    );
    expect(missing).toEqual([]);
  });

  it('keeps every migrated class list byte-for-byte equivalent to the former spell-owned lists', () => {
    const expected: Record<string, [number, string]> = {
      Artificer: [
        80,
        '1a003ff712a3a165e8b579a047d229129328c738ef07fc501df5ea87d3ebacc2',
      ],
      Bard: [
        140,
        '1e23cb1e4d992d55e172d092a41edbbcfa81528435a68e349e626cfd9f3922d1',
      ],
      Cleric: [
        117,
        '17732c9b300d5435a50417bdd19c54dd2a2ece96ecd3e9c4d9083725b6ca1c60',
      ],
      Druid: [
        135,
        'd49c61f260e21c2eb2a4630f76f721cc6c827018d77a28435bfd9158cd73112b',
      ],
      Paladin: [
        51,
        '2c3f323be91ceb8db63364131e57f396aa4ffb7bdad39b944e62f9fb0979bb64',
      ],
      Ranger: [
        61,
        '2439c2551fca3d87743bc17b758fe41fec56cdf6a22f9587d5ad3895cb4a804c',
      ],
      Sorcerer: [
        150,
        '1f520b0b935e5a71a1c7c0d01e3c93ff4e842d34a5b4ca79894004ddc6e8fcbc',
      ],
      Warlock: [
        91,
        '012101bd8fa48fbafcb9639363a4df394bd71c672a6ab4594867f489ff4b900f',
      ],
      Wizard: [
        242,
        'b68badb048f9247d55612a64248fa910d8d305200232eb73c90a45f512d8bbae',
      ],
    };
    expect(Object.keys(spellLists).sort()).toEqual(
      Object.keys(expected).sort(),
    );
    for (const [name, [count, hash]] of Object.entries(expected)) {
      const indexes = spellLists[name];
      expect(indexes).toHaveLength(count);
      expect(
        createHash('sha256')
          .update([...indexes].sort().join('\n'))
          .digest('hex'),
      ).toBe(hash);
    }
  });

  it('keeps subclass spellcasting lists equivalent to the former spell-owned lists', () => {
    const expectedHash =
      '35ce029748bb8f56d0d96b409dfb848471a81198b15face5f7b23fccfa211063';
    for (const [classIndex, subclassIndex] of [
      ['fighter', 'eldritch-knight'],
      ['rogue', 'arcane-trickster'],
    ]) {
      const cls = classes.find((entry) => entry.index === classIndex);
      const subclasses = Array.isArray(cls?.subclasses)
        ? (cls.subclasses as Record<string, unknown>[])
        : [];
      const subclass = subclasses.find(
        (entry) => entry.index === subclassIndex,
      );
      const spellcasting = subclass?.spellcasting as
        Record<string, unknown> | undefined;
      const indexes = spellcasting?.spells as string[];
      expect(indexes).toHaveLength(151);
      expect(
        createHash('sha256')
          .update([...indexes].sort().join('\n'))
          .digest('hex'),
      ).toBe(expectedHash);
    }
  });

  it('matches the PHB level distribution', () => {
    const counts = Object.fromEntries(
      Array.from({ length: 10 }, (_, level) => [
        String(level),
        phbSpells.filter((spell) => spell.level === level).length,
      ]),
    );
    expect(counts).toEqual({
      '0': 34,
      '1': 64,
      '2': 63,
      '3': 52,
      '4': 41,
      '5': 48,
      '6': 34,
      '7': 21,
      '8': 18,
      '9': 16,
    });
  });

  it('uses stable filenames and complete common metadata', () => {
    const schools = new Set([
      'Abjuration',
      'Conjuration',
      'Divination',
      'Enchantment',
      'Evocation',
      'Illusion',
      'Necromancy',
      'Transmutation',
    ]);

    for (const spell of spells) {
      expect(existsSync(join(spellsRoot, `${spell.index}.json`))).toBe(true);
      expect(spell.name).not.toBe('');
      expect(spell.level).toBeGreaterThanOrEqual(0);
      expect(spell.level).toBeLessThanOrEqual(9);
      expect(schools.has(spell.school)).toBe(true);
      expect(spell.casting_time).not.toBe('');
      expect(spell.range).not.toBe('');
      expect(spell.duration).not.toBe('');
      expect(spell.components.length).toBeGreaterThan(0);
      expect(spellAccess.get(spell.index)?.length).toBeGreaterThan(0);
      expect(spell.source.edition).toBe(2024);
      expect(spell.source.book).not.toBe('');
      expect(spell.source.code).not.toBe('');
    }
  });

  it('removes reverse access fields from spells and derives access from every provider type', () => {
    const acidSplash = spells.find((spell) => spell.index === 'acid-splash');
    expect(acidSplash).toMatchObject({
      level: 0,
      school: 'Evocation',
      mechanics: {
        saving_throws: ['dexterity'],
        damage_types: ['acid'],
        scaling: {
          label: 'Acid damage',
          values: { '1': '1d6', '5': '2d6', '11': '3d6', '17': '4d6' },
        },
      },
      source: { page: 239, srd_5_2_1: true },
    });
    for (const spell of spells) {
      for (const field of [
        'classes',
        'subclasses',
        'species',
        'backgrounds',
        'feats',
        'other_options',
      ]) {
        expect(spell).not.toHaveProperty(field);
      }
    }
    const acidAccess = spellAccess.get('acid-splash') ?? [];
    expect(acidAccess).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'class', provider_name: 'Artificer' }),
        expect.objectContaining({ kind: 'class', provider_name: 'Sorcerer' }),
        expect.objectContaining({ kind: 'class', provider_name: 'Wizard' }),
        expect.objectContaining({
          kind: 'subclass',
          provider_name: 'Eldritch Knight',
        }),
        expect.objectContaining({
          kind: 'species',
          provider_name: 'Elf',
          detail: 'High Elf',
        }),
        expect.objectContaining({
          kind: 'feat',
          provider_name: 'Magic Initiate',
          detail: 'Magic Initiate (Wizard)',
        }),
        expect.objectContaining({
          kind: 'background',
          provider_name: 'Sage',
          detail: 'Magic Initiate (Wizard)',
        }),
        expect.objectContaining({
          kind: 'class_feature',
          provider_name: 'Pact of the Tome',
        }),
      ]),
    );
  });

  it('tracks SRD coverage and supplies summaries for every reference-only spell', () => {
    expect(manifest.srd_5_2_1_rules_text).toBe(339);
    expect(manifest.reference_only).toBe(52);

    const acidArrow = spells.find(
      (spell) => spell.index === 'melfs-acid-arrow',
    );
    expect(acidArrow?.source).toMatchObject({
      srd_5_2_1: true,
      srd_name: 'Acid Arrow',
      rules_text: 'SRD 5.2.1',
    });

    const armorOfAgathys = spells.find(
      (spell) => spell.index === 'armor-of-agathys',
    );
    expect(armorOfAgathys).toMatchObject({
      source: {
        page: 243,
        srd_5_2_1: false,
        rules_text: 'reference-only',
      },
    });
    expect(spellAccess.get('armor-of-agathys')).toContainEqual(
      expect.objectContaining({ kind: 'class', provider_name: 'Warlock' }),
    );
    expect(armorOfAgathys?.description).toContain('5 Temporary Hit Points');

    const compelledDuel = spells.find(
      (spell) => spell.index === 'compelled-duel',
    );
    expect(compelledDuel?.source.rules_text).toBe('reference-only');
    expect(compelledDuel?.description).not.toContain(
      'Rules text is not reproduced here.',
    );
    expect(compelledDuel?.description).toContain('Wisdom saving throw');

    const referenceOnlySpells = phbSpells.filter(
      (spell) => spell.source.rules_text === 'reference-only',
    );
    expect(Object.keys(referenceOnlySummaries).sort()).toEqual(
      referenceOnlySpells.map((spell) => spell.index).sort(),
    );
    for (const spell of referenceOnlySpells) {
      expect(spell.description).toBe(referenceOnlySummaries[spell.index]);
      expect(spell.description).not.toContain(
        'Rules text is not reproduced here.',
      );
    }
  });
});
