import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface SpellAccessSubclass {
  class: string;
  subclass: string;
  variant?: string;
}

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
  classes: string[];
  subclasses: SpellAccessSubclass[];
  species: string[];
  backgrounds: string[];
  feats: string[];
  other_options: string[];
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
    expect(spells).toHaveLength(391);
    expect(manifest.total).toBe(391);
    expect(manifest.spells).toHaveLength(391);
    expect(manifest.spells.map((spell) => spell.index).sort()).toEqual(
      spells.map((spell) => spell.index).sort(),
    );
    expect(new Set(spells.map((spell) => spell.index)).size).toBe(391);
    expect(new Set(spells.map((spell) => spell.name)).size).toBe(391);
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

  it('matches the PHB level distribution', () => {
    const counts = Object.fromEntries(
      Array.from({ length: 10 }, (_, level) => [
        String(level),
        spells.filter((spell) => spell.level === level).length,
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
      expect(spell.classes.length).toBeGreaterThan(0);
      expect(spell.source).toMatchObject({
        book: "Player's Handbook",
        edition: 2024,
        code: 'XPHB',
      });
    }
  });

  it('includes PHB-only access metadata and excludes non-PHB sources', () => {
    const acidSplash = spells.find((spell) => spell.index === 'acid-splash');
    expect(acidSplash).toMatchObject({
      level: 0,
      school: 'Evocation',
      classes: ['Sorcerer', 'Wizard'],
      species: ['Elf'],
      feats: ['Magic Initiate'],
      other_options: ['Pact of the Tome'],
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
    expect(acidSplash?.subclasses).toContainEqual({
      class: 'Fighter',
      subclass: 'Eldritch Knight',
    });
    expect(acidSplash?.subclasses).not.toContainEqual(
      expect.objectContaining({ subclass: 'Arcana Domain' }),
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
      classes: ['Warlock'],
      source: {
        page: 243,
        srd_5_2_1: false,
        rules_text: 'reference-only',
      },
    });
    expect(armorOfAgathys?.description).toContain('5 Temporary Hit Points');

    const compelledDuel = spells.find(
      (spell) => spell.index === 'compelled-duel',
    );
    expect(compelledDuel?.source.rules_text).toBe('reference-only');
    expect(compelledDuel?.description).not.toContain(
      'Rules text is not reproduced here.',
    );
    expect(compelledDuel?.description).toContain('Wisdom saving throw');

    const referenceOnlySpells = spells.filter(
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
