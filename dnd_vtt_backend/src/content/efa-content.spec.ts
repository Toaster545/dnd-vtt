import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const contentRoot = join(process.cwd(), 'content');
const readJson = <T>(...parts: string[]): T =>
  JSON.parse(readFileSync(join(contentRoot, ...parts), 'utf8')) as T;
const readKind = (kind: string) =>
  readdirSync(join(contentRoot, kind))
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson<Record<string, unknown>>(kind, file));
const sourceCode = (entry: Record<string, unknown>) =>
  (entry.source as { code?: string } | undefined)?.code;

interface EfaManifest {
  catalog: Record<string, string[]>;
  artificer_magic_item_plans: string[];
}

describe('Eberron: Forge of the Artificer content manifest', () => {
  const manifest = readJson<EfaManifest>(
    'manifests',
    'eberron-forge-of-the-artificer.json',
  );

  it.each([
    ['classes', 'classes'],
    ['species', 'races'],
    ['backgrounds', 'backgrounds'],
    ['feats', 'feats'],
    ['items', 'items'],
    ['spells', 'spells'],
  ] as const)('contains the exact EFA %s catalog', (manifestKey, directory) => {
    const expected = [...manifest.catalog[manifestKey]].sort();
    const actual = readKind(directory)
      .filter((entry) => sourceCode(entry) === 'EFA')
      .map((entry) => String(entry.index))
      .sort();
    expect(actual).toEqual(expected);
    for (const index of expected) {
      expect(existsSync(join(contentRoot, directory, `${index}.json`))).toBe(
        true,
      );
    }
  });

  it('separates the published bestiary from player companion templates', () => {
    const expected = [
      ...manifest.catalog.monsters,
      ...manifest.catalog.companion_templates,
    ].sort();
    const actual = readKind('monsters')
      .filter((entry) => sourceCode(entry) === 'EFA')
      .map((entry) => String(entry.index))
      .sort();
    expect(actual).toEqual(expected);
  });

  it('contains the exact five Artificer subclasses', () => {
    const artificer = readJson<{
      subclasses: { index: string; source?: { code?: string } }[];
    }>('classes', 'artificer.json');
    expect(artificer.subclasses.map((entry) => entry.index).sort()).toEqual(
      [...manifest.catalog.subclasses].sort(),
    );
    expect(
      artificer.subclasses.every((entry) => entry.source?.code === 'EFA'),
    ).toBe(true);
  });

  it('keeps all 56 Magic Item Plans in the canonical manifest and class choice', () => {
    const artificer = readJson<{
      levels: { grants?: { key?: string; options?: { name: string }[] }[] }[];
    }>('classes', 'artificer.json');
    const planGrant = artificer.levels
      .flatMap((level) => level.grants ?? [])
      .find((grant) => grant.key === 'magic_item_plans');
    expect(manifest.artificer_magic_item_plans).toHaveLength(56);
    expect(planGrant?.options?.map((option) => option.name)).toEqual(
      manifest.artificer_magic_item_plans,
    );
  });

  it('resolves EFA background equipment, origin feats, feat prerequisites, and spell grants', () => {
    const itemIndexes = new Set(
      readKind('items').map((entry) => String(entry.index)),
    );
    const featIndexes = new Set(
      readKind('feats').map((entry) => String(entry.index)),
    );
    const spellIndexes = new Set(
      readKind('spells').map((entry) => String(entry.index)),
    );
    const backgrounds = readKind('backgrounds').filter(
      (entry) => sourceCode(entry) === 'EFA',
    );
    const feats = readKind('feats').filter(
      (entry) => sourceCode(entry) === 'EFA',
    );

    for (const background of backgrounds) {
      const equipment = background.starting_equipment as {
        fixed: { item?: string; category?: string }[];
      };
      for (const reference of equipment.fixed) {
        if (reference.item) expect(itemIndexes.has(reference.item)).toBe(true);
      }
      const featName = String(background.feature).replace(
        /^Origin Feat:\s*/i,
        '',
      );
      expect(
        [...featIndexes].some((index) => {
          const feat = readJson<{ name: string }>('feats', `${index}.json`);
          return feat.name === featName;
        }),
      ).toBe(true);
    }

    const visitGrants = (grants: unknown[]) => {
      for (const rawGrant of grants) {
        const grant = rawGrant as {
          type?: string;
          spells?: string[];
          options?: { grants?: unknown[] }[];
        };
        for (const spell of grant.spells ?? [])
          expect(spellIndexes.has(spell)).toBe(true);
        for (const option of grant.options ?? [])
          visitGrants(option.grants ?? []);
      }
    };
    for (const feat of feats) {
      const prerequisite = feat.prerequisite as
        { feats?: string[] } | undefined;
      for (const required of prerequisite?.feats ?? [])
        expect(featIndexes.has(required)).toBe(true);
      visitGrants((feat.grants as unknown[] | undefined) ?? []);
    }
  });
});
