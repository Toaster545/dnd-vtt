import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Grant {
  type: string;
  key?: string;
  choose?: number;
  chooseByLevel?: Record<string, number>;
  options?: {
    name: string;
    prerequisite?: { level?: number; selections?: string[] };
  }[];
}

interface WarlockContent {
  index: string;
  primary_abilities: string[];
  subclass_level: number;
  starting_equipment: {
    fixed: { item: string }[];
    groups: unknown[];
    gold: number;
    goldAlternative: number;
  };
  subclasses: {
    index: string;
    levels: { level: number; grants?: Grant[] }[];
  }[];
  levels: {
    level: number;
    grants?: Grant[];
    pact_magic: { slots: number; slot_level: number };
    class_specific: { invocations_known: number };
  }[];
}

describe('Warlock class content', () => {
  const contentRoot = join(process.cwd(), 'content');
  const warlock = JSON.parse(
    readFileSync(join(contentRoot, 'classes', 'warlock.json'), 'utf8'),
  ) as WarlockContent;

  it('uses the same complete structured class shape as Fighter', () => {
    expect(warlock.index).toBe('warlock');
    expect(warlock.primary_abilities).toEqual(['charisma']);
    expect(warlock.subclass_level).toBe(3);
    expect(warlock.levels.map((level) => level.level)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(warlock.subclasses.map((subclass) => subclass.index)).toEqual([
      'archfey',
      'celestial',
      'fiend',
      'great-old-one',
    ]);
    expect(
      warlock.subclasses.every(
        (subclass) =>
          subclass.levels.map((level) => level.level).join(',') ===
            '3,6,10,14' &&
          subclass.levels.every((level) => (level.grants?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });

  it('tracks the 2024 invocation and Pact Magic progressions', () => {
    const invocations = warlock.levels[0].grants?.find(
      (grant) => grant.key === 'eldritch_invocations',
    );

    expect(invocations?.chooseByLevel).toEqual({
      '1': 1,
      '2': 3,
      '5': 5,
      '7': 6,
      '9': 7,
      '12': 8,
      '15': 9,
      '18': 10,
    });
    expect(invocations?.options).toHaveLength(28);
    expect(
      invocations?.options?.find((option) => option.name === 'Devouring Blade')
        ?.prerequisite,
    ).toEqual({ level: 12, selections: ['Thirsting Blade'] });

    expect(warlock.levels[0].pact_magic).toEqual({ slots: 1, slot_level: 1 });
    expect(warlock.levels[19].pact_magic).toEqual({ slots: 4, slot_level: 5 });
    expect(warlock.levels[19].class_specific.invocations_known).toBe(10);
  });

  it('resolves every structured starting-equipment item to an item file', () => {
    expect(warlock.starting_equipment.groups).toEqual([]);
    expect(warlock.starting_equipment.gold).toBe(15);
    expect(warlock.starting_equipment.goldAlternative).toBe(100);

    for (const ref of warlock.starting_equipment.fixed) {
      expect(existsSync(join(contentRoot, 'items', `${ref.item}.json`))).toBe(
        true,
      );
    }
  });
});
