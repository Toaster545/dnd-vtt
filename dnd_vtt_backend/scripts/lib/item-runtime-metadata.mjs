import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Supplemental structured fields that the source importers previously reduced to prose.
export function writeItemRuntimeMetadata(root = resolve('content')) {
  const overrides = {
    'clockwork-amulet': { charges: { max: 1, recovery: 'dawn', restore: 'all' } },
    'masquerade-tattoo': { charges: { max: 1, recovery: 'dawn', restore: 'all' } },
    'hat-of-wizardry': { charges: { max: 1, recovery: 'long_rest', restore: 'all' } },
    'dark-shard-amulet': { charges: { max: 1, recovery: 'long_rest', restore: 'all' } },
    'shield-of-expression': { type: 'armor', category: 'Shield', armor_class: '+2', weight: 6 },
  };
  for (const id of ['staff-of-adornment', 'staff-of-birdcalls', 'staff-of-flowers']) {
    overrides[id] = { type: 'weapon', category: 'Simple Melee', damage: '1d6', damage_type: 'bludgeoning', properties: ['Versatile (1d8)'], weight: 4, magical_weapon: false };
  }
  for (const [id, fields] of Object.entries(overrides)) {
    const path = resolve(root, 'items', `${id}.json`);
    if (!existsSync(path)) continue;
    const item = { ...JSON.parse(readFileSync(path, 'utf8')), ...fields };
    writeFileSync(path, JSON.stringify(item, null, 2) + '\n');
  }
}
