export interface ItemNameFields {
  name?: unknown;
  enhancement_bonus?: unknown;
}

// Mirrors the frontend's itemDisplayName (content.service.ts) — a magic weapon/armor's own
// `name` is stored plain ("Longsword"), so the "+N" stamped onto a granted item's equipment
// entry is derived from `enhancement_bonus` here rather than baked into the content file.
export function itemDisplayName(item: ItemNameFields): string {
  const name = typeof item.name === 'string' ? item.name : '';
  const bonus = item.enhancement_bonus;
  if (typeof bonus !== 'number' || bonus === 0) return name;
  return `${name} ${bonus > 0 ? '+' : ''}${bonus}`;
}
