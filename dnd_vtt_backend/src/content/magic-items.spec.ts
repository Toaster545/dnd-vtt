import { readFileSync } from 'fs';
import { join } from 'path';
import {
  eligibleBase,
  ItemDefinition,
  MagicPlan,
} from '../characters/inventory-rules';

describe('level 2 magic item plans', () => {
  const read = <T>(path: string): T =>
    JSON.parse(readFileSync(join(process.cwd(), 'content', path), 'utf8')) as T;
  const plans = read<MagicPlan[]>('plans/magic-item-plans.json');
  it('has an explicit output for every named level 2 plan', () => {
    const artificer = read<{
      levels: {
        grants?: {
          key?: string;
          options?: { name: string; prerequisite?: { level: number } }[];
        }[];
      }[];
    }>('classes/artificer.json');
    const grant = artificer.levels
      .flatMap((l) => l.grants ?? [])
      .find((g) => g.key === 'magic_item_plans')!;
    expect(plans.map((p) => p.name).sort()).toEqual(
      grant
        .options!.filter((o) => !o.prerequisite)
        .map((o) => o.name)
        .sort(),
    );
    for (const plan of plans.filter((p) => !p.common)) {
      const item = read<ItemDefinition>(`items/${plan.itemIndex}.json`);
      expect(item.index).toBe(plan.itemIndex);
      expect(item.source?.code).toBeTruthy();
      if (plan.baseFilter)
        expect(item.variant?.baseFilter).toBe(plan.baseFilter);
    }
  });
  it('keeps enhancements structured and requires compatible mundane weapon bases', () => {
    for (const id of ['returning-weapon', 'repeating-shot', 'weapon-plus-1'])
      expect(read<ItemDefinition>(`items/${id}.json`).enhancement_bonus).toBe(
        1,
      );
    expect(
      eligibleBase(read<ItemDefinition>('items/dagger.json'), 'thrown-weapon'),
    ).toBe(true);
    expect(
      eligibleBase(read<ItemDefinition>('items/longbow.json'), 'thrown-weapon'),
    ).toBe(false);
    expect(
      eligibleBase(
        read<ItemDefinition>('items/light-crossbow.json'),
        'ammunition-weapon',
      ),
    ).toBe(true);
    expect(
      read<ItemDefinition>('items/repeating-shot.json').requires_attunement,
    ).toBe(true);
    expect(
      read<ItemDefinition>('items/returning-weapon.json').requires_attunement,
    ).toBe(false);
  });
});
