import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseService } from '../common/database.service';
import { ContentService } from './content.service';

interface SourcedEntry {
  index: string;
  name?: string;
  description?: string;
  source?: { code: string };
}

interface FeatureGrant {
  type: string;
  key?: string;
  name?: string;
  description?: string;
  action?: unknown;
  monsterIndex?: string;
  spells?: string[];
}

interface SubclassEntry extends SourcedEntry {
  class_index: string;
  levels?: { grants?: FeatureGrant[] }[];
}

const contentRoot = join(process.cwd(), 'content');
const readFolder = <T>(folder: string): T[] =>
  readdirSync(join(contentRoot, folder))
    .filter((file) => file.endsWith('.json'))
    .map(
      (file) =>
        JSON.parse(readFileSync(join(contentRoot, folder, file), 'utf8')) as T,
    );
const manifest = JSON.parse(
  readFileSync(
    join(contentRoot, 'manifests', 'tashas-cauldron-of-everything.json'),
    'utf8',
  ),
) as {
  counts: Record<string, number>;
  spell_list_additions: Record<string, string[]>;
  catalog: {
    optional_features: {
      name: string;
      description: string;
      status:
        | 'supplied_by_host_2024'
        | 'implemented_by_tce_subclass'
        | 'legacy_reference';
    }[];
  };
  supplied_by_phb_2024: {
    subclasses: unknown[];
    feats: unknown[];
    spells: unknown[];
  };
  supplied_by_eberron_forge_of_the_artificer: {
    subclasses: unknown[];
    creatures: unknown[];
  };
};

function grants(value: unknown): FeatureGrant[] {
  if (Array.isArray(value)) return value.flatMap(grants);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.type === 'string'
      ? [record as unknown as FeatureGrant]
      : []),
    ...Object.values(record).flatMap(grants),
  ];
}

describe("Tasha's Cauldron of Everything content", () => {
  const spells = readFolder<SourcedEntry>('spells');
  const feats = readFolder<SourcedEntry>('feats');
  const items = readFolder<SourcedEntry>('items');
  const monsters = readFolder<SourcedEntry>('monsters');
  const subclasses = readFolder<SubclassEntry>('subclasses');
  const tceSpells = spells.filter((entry) => entry.source?.code === 'TCE');
  const tceFeats = feats.filter((entry) => entry.source?.code === 'TCE');
  const tceItems = items.filter((entry) => entry.source?.code === 'TCE');
  const tceMonsters = monsters.filter((entry) => entry.source?.code === 'TCE');
  const tceSubclasses = subclasses.filter(
    (entry) => entry.source?.code === 'TCE',
  );

  it('records the complete supported inventory without duplicating newer reprints', () => {
    expect(manifest.counts).toMatchObject({
      published_phb_class_subclasses: 26,
      imported_subclasses: 18,
      phb_2024_subclass_reprints: 8,
      artificer_subclasses_supplied_by_efa: 4,
      published_spells: 21,
      imported_spells: 12,
      phb_2024_spell_reprints: 9,
      published_feats: 15,
      imported_feats: 5,
      phb_2024_feat_reprints: 10,
      published_magic_items: 47,
      selectable_magic_item_variants: 84,
      creatures: 20,
      imported_creatures: 18,
      creatures_supplied_by_efa: 2,
      optional_feature_entries: 47,
    });
    expect(tceSubclasses).toHaveLength(18);
    expect(tceSpells).toHaveLength(12);
    expect(tceFeats).toHaveLength(5);
    expect(tceItems).toHaveLength(84);
    expect(tceMonsters).toHaveLength(18);
    expect(manifest.catalog.optional_features).toHaveLength(47);
    for (const feature of manifest.catalog.optional_features) {
      expect(feature.description).toBeTruthy();
      expect([
        'supplied_by_host_2024',
        'implemented_by_tce_subclass',
        'legacy_reference',
      ]).toContain(feature.status);
    }
    expect(manifest.supplied_by_phb_2024.subclasses).toHaveLength(8);
    expect(manifest.supplied_by_phb_2024.spells).toHaveLength(9);
    expect(manifest.supplied_by_phb_2024.feats).toHaveLength(10);
    expect(
      manifest.supplied_by_eberron_forge_of_the_artificer.subclasses,
    ).toHaveLength(4);
    expect(
      manifest.supplied_by_eberron_forge_of_the_artificer.creatures,
    ).toHaveLength(2);
  });

  it('uses stable indexes, useful summaries, and TCE source metadata', () => {
    for (const group of [
      tceSubclasses,
      tceSpells,
      tceFeats,
      tceItems,
      tceMonsters,
    ]) {
      expect(new Set(group.map((entry) => entry.index)).size).toBe(
        group.length,
      );
      for (const entry of group) {
        expect(entry.source?.code).toBe('TCE');
        expect(entry.description).toBeTruthy();
        expect(entry.description).not.toContain('Rules text is not reproduced');
      }
    }
  });

  it('connects every imported spell and fixed grant to the combined catalog', () => {
    const listed = new Set(Object.values(manifest.spell_list_additions).flat());
    for (const spell of tceSpells) expect(listed.has(spell.index)).toBe(true);

    const spellIndexes = new Set(spells.map((spell) => spell.index));
    const missing = [...tceFeats, ...tceSubclasses]
      .flatMap(grants)
      .flatMap((grant) => grant.spells ?? [])
      .filter((index) => !spellIndexes.has(index));
    expect(missing).toEqual([]);
  });

  it('keeps actionable subclass features stable and companion grants resolvable', () => {
    const subclassGrants = tceSubclasses.flatMap((subclass) =>
      grants(subclass),
    );
    const actionable = subclassGrants.filter((grant) => grant.action);
    expect(actionable.length).toBeGreaterThan(25);
    for (const grant of actionable) expect(grant.key).toMatch(/^tce_/);

    const monsterIndexes = new Set(monsters.map((monster) => monster.index));
    for (const grant of subclassGrants.filter(
      (candidate) => candidate.type === 'companion_grant',
    )) {
      expect(monsterIndexes.has(String(grant.monsterIndex))).toBe(true);
    }
  });

  it('merges TCE subclasses and class spell additions at the API boundary', async () => {
    const service = new ContentService({} as DatabaseService);
    const wizard = service.getClass('wizard');
    const wizardSubclasses = wizard.subclasses as Record<string, unknown>[];
    const spellcasting = wizard.spellcasting as { spells: string[] };
    expect(
      wizardSubclasses.find((subclass) => subclass.index === 'scribes'),
    ).toMatchObject({ source: { code: 'TCE' } });
    expect(spellcasting.spells).toContain('tashas-mind-whip');

    const spell = (await service.getSpells()).find(
      (entry) => entry.index === 'tashas-mind-whip',
    );
    expect(spell?.access).toContainEqual(
      expect.objectContaining({ kind: 'class', provider_name: 'Wizard' }),
    );
  });
});
