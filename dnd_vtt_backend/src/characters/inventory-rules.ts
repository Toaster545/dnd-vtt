import { randomUUID } from 'crypto';

export interface ItemDefinition {
  index: string;
  name: string;
  type: string;
  category: string;
  properties?: string[];
  rarity?: string;
  requires_attunement?: boolean | string;
  enhancement_bonus?: number;
  cursed?: boolean;
  source?: { code?: string };
  variant?: {
    baseFilter: string;
    namePrefix?: string;
    removeProperties?: string[];
  };
  charges?: { max: number; recovery: string; restore?: string };
  effects?: { type: string; value?: number; tags?: string[] }[];
  actions?: { key: string; uses?: { max: number; per: string } }[];
  spell?: { index: string; name: string; concentration?: boolean };
  [key: string]: unknown;
}
export interface ItemInstance {
  instanceId: string;
  itemIndex: string;
  name: string;
  quantity: number;
  equipped: boolean;
  attuned?: boolean;
  baseItemIndex?: string;
  chargesUsed?: number;
  needsBase?: boolean;
  unresolved?: boolean;
  origin?: {
    creatorId: string;
    planId: string;
    planName: string;
    createdAt: string;
  };
  resolvedItem?: ItemDefinition;
}
export interface MagicPlan {
  id: string;
  name: string;
  level: number;
  itemIndex?: string;
  baseFilter?: string;
  common?: boolean;
}
export const records = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter(
        (x): x is Record<string, unknown> => !!x && typeof x === 'object',
      )
    : [];

export function eligibleBase(item: ItemDefinition, filter: string): boolean {
  if (item.rarity || item.enhancement_bonus || item.variant) return false;
  if (item.type !== 'weapon') return false;
  if (filter === 'weapon') return true;
  const property = filter === 'thrown-weapon' ? 'Thrown' : 'Ammunition';
  return (item.properties ?? []).some((p) => p.startsWith(property));
}

export function eligibleCommon(
  item: ItemDefinition,
  enabled: string[],
): boolean {
  return (
    item.rarity?.toLowerCase() === 'common' &&
    !item.cursed &&
    !item.variant &&
    !/potion|scroll/i.test(item.category) &&
    item.type !== 'consumable' &&
    (!item.source?.code ||
      ['SRD', 'SRD5.2', 'PHB', 'XPHB', 'DMG'].includes(item.source.code) ||
      enabled.includes(item.source.code))
  );
}

export function resolveItem(
  entry: ItemInstance,
  template: ItemDefinition,
  base?: ItemDefinition,
): ItemDefinition | undefined {
  if (
    template.variant &&
    (!base || !eligibleBase(base, template.variant.baseFilter))
  )
    return undefined;
  const item =
    template.variant && base
      ? {
          ...base,
          ...template,
          type: base.type,
          category: base.category,
          damage: base.damage,
          damage_type: base.damage_type,
          weight: base.weight,
          mastery: base.mastery,
          properties: (base.properties ?? []).filter(
            (p) =>
              (template.requires_attunement && !entry.attuned) ||
              !template.variant?.removeProperties?.some((r) => p.startsWith(r)),
          ),
          name: [template.variant.namePrefix, base.name]
            .filter(Boolean)
            .join(' '),
        }
      : { ...template };
  // Older catalogs expressed single-pool limited item abilities as action uses.
  // Resolve them to an instance pool rather than reverting to shared class counters.
  const limited = item.actions?.find(
    (a) => a.uses && Number.isFinite(a.uses.max),
  );
  if (!item.charges && limited?.uses)
    item.charges = {
      max: limited.uses.max,
      recovery: limited.uses.per,
      restore: 'all',
    };
  // Catalog identity stays available; runtime identity belongs to this physical copy.
  return { ...item, index: entry.itemIndex, instanceId: entry.instanceId };
}

// Used both by the schema migration and for newly created/campaign-cloned characters.
export function migrateInventory(
  characterId: string,
  data: Record<string, unknown>,
  definitions: Map<string, ItemDefinition> = new Map(),
): ItemInstance[] {
  const entries: ItemInstance[] = [];
  for (const raw of records(data.equipment)) {
    const entry = {
      ...raw,
      instanceId: randomUUID(),
    } as unknown as ItemInstance;
    const pact = data.pact_weapon as Record<string, unknown> | undefined;
    if (pact?.instanceId && pact.instanceId === raw.instanceId) {
      data.pact_weapon = { ...pact, instanceId: entry.instanceId };
    }
    delete entry.resolvedItem;
    const oldUses = (data.resource_uses ?? {}) as Record<string, number>;
    const actionKeys = definitions
      .get(entry.itemIndex)
      ?.actions?.map((a) => a.key) ?? [`item:${entry.itemIndex}`];
    entry.chargesUsed ??= Math.max(
      0,
      ...actionKeys.map((key) => Number(oldUses[key] ?? 0)),
    );
    if (entry.origin)
      entry.origin = { ...entry.origin, creatorId: characterId };
    const individual =
      !!definitions.get(entry.itemIndex)?.rarity || !!entry.origin;
    const quantity = Math.max(1, Number(entry.quantity) || 1);
    if (individual) {
      for (let copy = 0; copy < quantity; copy++)
        entries.push({
          ...entry,
          instanceId: copy ? randomUUID() : entry.instanceId,
          quantity: 1,
          attuned: copy === 0 && entry.attuned,
        });
    } else entries.push({ ...entry, quantity });
  }
  for (const raw of records(data.replicated_items)) {
    // Modern projections already live in equipment; do not clone them twice.
    if (raw.instanceId) continue;
    entries.push({
      instanceId: randomUUID(),
      itemIndex: String(raw.itemIndex),
      name: String(raw.planName),
      quantity: 1,
      equipped: raw.equipped === true,
      attuned: raw.attuned === true,
      origin: {
        creatorId: characterId,
        planId: String(raw.itemIndex),
        planName: String(raw.planName),
        createdAt:
          typeof raw.createdAt === 'string'
            ? raw.createdAt
            : new Date().toISOString(),
      },
    });
  }
  return entries;
}
