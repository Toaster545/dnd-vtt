import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseService } from '../common/database.service';
import { ContentService } from './content.service';

interface SourcedEntry {
  index: string;
  source?: { code: string };
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
    join(contentRoot, 'manifests', 'xanathars-guide-to-everything.json'),
    'utf8',
  ),
) as {
  counts: Record<string, number>;
  spell_list_additions: Record<string, string[]>;
  supplied_by_phb_2024: { subclasses: unknown[]; spells: unknown[] };
};

function fixedSpellReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(fixedSpellReferences);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own =
    record.type === 'spell_grant' && Array.isArray(record.spells)
      ? record.spells.filter(
          (spell): spell is string => typeof spell === 'string',
        )
      : [];
  return [...own, ...Object.values(record).flatMap(fixedSpellReferences)];
}

describe("Xanathar's Guide to Everything content", () => {
  const spells = readFolder<SourcedEntry>('spells');
  const feats = readFolder<SourcedEntry>('feats');
  const items = readFolder<SourcedEntry>('items');
  const subclasses = readFolder<SourcedEntry & { class_index: string }>(
    'subclasses',
  );
  const xgeSpells = spells.filter((entry) => entry.source?.code === 'XGE');
  const xgeFeats = feats.filter((entry) => entry.source?.code === 'XGE');
  const xgeItems = items.filter((entry) => entry.source?.code === 'XGE');
  const xgeSubclasses = subclasses.filter(
    (entry) => entry.source?.code === 'XGE',
  );

  it('records the complete published inventory without duplicating PHB 2024 reprints', () => {
    expect(manifest.counts).toMatchObject({
      published_subclasses: 31,
      imported_subclasses: 27,
      phb_2024_subclass_reprints: 4,
      published_spells: 95,
      imported_spells: 85,
      phb_2024_spell_reprints: 10,
      feats: 15,
      magic_items: 43,
    });
    expect(xgeSubclasses).toHaveLength(27);
    expect(xgeSpells).toHaveLength(85);
    expect(xgeFeats).toHaveLength(15);
    expect(xgeItems).toHaveLength(43);
    expect(manifest.supplied_by_phb_2024.subclasses).toHaveLength(4);
    expect(manifest.supplied_by_phb_2024.spells).toHaveLength(10);
  });

  it('connects every imported spell to at least one class list', () => {
    const listed = new Set(Object.values(manifest.spell_list_additions).flat());
    for (const spell of xgeSpells) expect(listed.has(spell.index)).toBe(true);
  });

  it('keeps every fixed XGE spell grant linked to the combined catalog', () => {
    const indexes = new Set(spells.map((spell) => spell.index));
    const missing = [...xgeFeats, ...xgeSubclasses]
      .flatMap(fixedSpellReferences)
      .filter((index) => !indexes.has(index));
    expect(missing).toEqual([]);
  });

  it('uses stable unique indexes and reference-only source metadata', () => {
    const entries = [...xgeSpells, ...xgeFeats, ...xgeItems];
    for (const group of [xgeSpells, xgeFeats, xgeItems, xgeSubclasses]) {
      expect(new Set(group.map((entry) => entry.index)).size).toBe(
        group.length,
      );
    }
    for (const entry of entries) expect(entry.source?.code).toBe('XGE');
    expect(new Set(xgeSubclasses.map((entry) => entry.class_index)).size).toBe(
      12,
    );
  });

  it('merges expansion subclasses and class spell additions at the API boundary', async () => {
    const service = new ContentService({} as DatabaseService);
    const wizard = service.getClass('wizard');
    const subclasses = wizard.subclasses as Record<string, unknown>[];
    const spellcasting = wizard.spellcasting as { spells: string[] };
    const warMagic = subclasses.find(
      (subclass) => subclass.index === 'war-magic',
    );
    expect(warMagic).toBeDefined();
    expect(warMagic?.source).toMatchObject({ code: 'XGE' });
    expect(spellcasting.spells).toContain('absorb-elements');

    const absorbElements = (await service.getSpells()).find(
      (spell) => spell.index === 'absorb-elements',
    );
    expect(absorbElements?.access).toContainEqual(
      expect.objectContaining({ kind: 'class', provider_name: 'Wizard' }),
    );
  });
});
