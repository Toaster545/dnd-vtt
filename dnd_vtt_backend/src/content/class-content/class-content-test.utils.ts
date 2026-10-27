import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Grant {
  type: string;
  name?: string;
  description?: string;
  key?: string;
  choose?: number;
  chooseByLevel?: Record<string, number>;
  spells?: string[];
  skills?: string[];
  category?: string;
  proficiency?: string[];
  effects?: {
    type: string;
    condition?: string;
    tags?: string[];
    ability?: string;
    minimum?: number;
    value?: number;
  }[];
  options?: {
    name: string;
    prerequisite?: { level?: number; selections?: string[] };
    effects?: {
      type: string;
      tags?: string[];
      ability?: string;
      minimum?: number;
      value?: number;
    }[];
  }[];
  action?: {
    activation: string;
    uses?: {
      max: number;
      maxByLevel?: Record<string, number>;
      maxAbilityModifier?: string;
      minimum?: number;
      per: string;
      perByLevel?: Record<string, string>;
      shortRestRestore?: number;
    };
  };
}

export interface EquipmentRef {
  item?: string;
  quantity?: number;
  category?: string;
}

export interface StructuredEquipment {
  fixed: EquipmentRef[];
  groups: { options: { items: EquipmentRef[] }[] }[];
  gold: number;
  goldAlternative: number;
}

export interface ClassContent {
  index: string;
  primary_abilities: string[];
  subclass_level: number;
  starting_equipment: StructuredEquipment;
  subclasses: {
    index: string;
    levels: {
      level: number;
      features: string[];
      grants?: Grant[];
      spell_slots?: Record<string, number>;
      cantrips_known?: number;
      prepared_spells?: number;
    }[];
  }[];
  levels: {
    level: number;
    grants?: Grant[];
    pact_magic?: { slots: number; slot_level: number };
    spell_slots?: Record<string, number>;
    cantrips_known?: number;
    spells_known?: number;
    prepared_spells?: number;
    class_specific?: Record<string, number | string>;
  }[];
}

const contentRoot = join(process.cwd(), 'content');

export function loadClassContent<T extends ClassContent>(index: string): T {
  return JSON.parse(
    readFileSync(join(contentRoot, 'classes', `${index}.json`), 'utf8'),
  ) as T;
}

export function expectLevelsOneThroughTwenty(content: ClassContent): void {
  expect(content.levels.map((level) => level.level)).toEqual(
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
}

export function expectEquipmentItemsToExist(
  equipment: StructuredEquipment,
): void {
  const refs = [
    ...equipment.fixed,
    ...equipment.groups.flatMap((group) =>
      group.options.flatMap((option) => option.items),
    ),
  ];

  for (const ref of refs) {
    if (!ref.item) continue;
    expect(existsSync(join(contentRoot, 'items', `${ref.item}.json`))).toBe(
      true,
    );
  }
}
