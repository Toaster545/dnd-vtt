import { DndItem, EquipmentItemRef, StartingEquipment } from '../services/content.service';

export interface ResolvedEquipment {
  items: { itemIndex: string; quantity: number }[];
  gold: number;
}

// Storage-key conventions inside a class's/background's equipment `choices` record — same
// `Record<string, string[]>` shape (and same one-bucket-per-source) as trait picks elsewhere,
// just with its own key namespace so it can't collide with a grant key.
const MODE_KEY = 'mode';
const groupKey = (key: string) => `group:${key}`;
const catKey   = (key: string) => `cat:${key}`;

export function equipmentMode(choices: Record<string, string[]>): 'gear' | 'gold' {
  return choices[MODE_KEY]?.[0] === 'gold' ? 'gold' : 'gear';
}

export function withMode(choices: Record<string, string[]>, mode: 'gear' | 'gold'): Record<string, string[]> {
  return { ...choices, [MODE_KEY]: [mode] };
}

export function groupOptionKey(choices: Record<string, string[]>, group: { key: string }): string | null {
  return choices[groupKey(group.key)]?.[0] ?? null;
}

export function withGroupOption(choices: Record<string, string[]>, group: { key: string }, optionKey: string): Record<string, string[]> {
  return { ...choices, [groupKey(group.key)]: [optionKey] };
}

export function categoryPick(choices: Record<string, string[]>, ref: { key: string }): string | null {
  return choices[catKey(ref.key)]?.[0] ?? null;
}

export function withCategoryPick(choices: Record<string, string[]>, ref: { key: string }, itemIndex: string): Record<string, string[]> {
  return { ...choices, [catKey(ref.key)]: [itemIndex] };
}

function resolveRef(ref: EquipmentItemRef, choices: Record<string, string[]>): { itemIndex: string; quantity: number } | null {
  if ('item' in ref) return { itemIndex: ref.item, quantity: ref.quantity ?? 1 };
  const picked = categoryPick(choices, ref);
  return picked ? { itemIndex: picked, quantity: ref.quantity ?? 1 } : null;
}

// What a class/background actually contributes to the character right now: either the
// gold alternative (option "b"), or the fixed items plus whichever option was picked in each
// group (option "a") — category refs left unpicked are simply omitted rather than guessed.
export function resolveStartingEquipment(equip: StartingEquipment, choices: Record<string, string[]>): ResolvedEquipment {
  if (equipmentMode(choices) === 'gold') return { items: [], gold: equip.goldAlternative };

  const items: { itemIndex: string; quantity: number }[] = [];
  let gold = equip.gold;
  for (const ref of equip.fixed) {
    const resolved = resolveRef(ref, choices);
    if (resolved) items.push(resolved);
  }
  for (const group of equip.groups) {
    const optionKey = groupOptionKey(choices, group);
    const option = group.options.find(o => o.key === optionKey);
    if (!option) continue;
    gold += option.gold ?? 0;
    for (const ref of option.items) {
      const resolved = resolveRef(ref, choices);
      if (resolved) items.push(resolved);
    }
  }
  return { items, gold };
}

// Every choice needed to fully resolve this source has been made — a group option picked, and
// any category ref within it (or in `fixed`) resolved to a specific item. Gold mode is always
// complete (nothing left to pick).
export function isEquipmentComplete(equip: StartingEquipment, choices: Record<string, string[]>): boolean {
  if (equipmentMode(choices) === 'gold') return true;
  const needsCategoryPick = (ref: EquipmentItemRef) => !('item' in ref) && !categoryPick(choices, ref);
  if (equip.fixed.some(needsCategoryPick)) return false;
  for (const group of equip.groups) {
    const optionKey = groupOptionKey(choices, group);
    const option = group.options.find(o => o.key === optionKey);
    if (!option || option.items.some(needsCategoryPick)) return false;
  }
  return true;
}

// Older content not yet migrated to the structured `StartingEquipment` shape (still a bare
// array of description strings) — treated as unavailable rather than crashing the equipment
// step, until that class/background is converted.
export function isStructuredEquipment(value: unknown): value is StartingEquipment {
  return !!value && typeof value === 'object' && Array.isArray((value as StartingEquipment).groups);
}

export function categoryOptions(items: DndItem[], ref: { category: string }): DndItem[] {
  return items.filter(it => it.category.startsWith(ref.category));
}
