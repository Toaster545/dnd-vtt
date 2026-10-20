// Shared by the EFA import and the checked-in content refresh. Keep mechanics here,
// not in descriptions, so rerunning the importer cannot erase playable variants.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function writeMagicItemContent(root = resolve('content')) {
  const source = { code: 'EFA', book: 'Eberron: Forge of the Artificer', edition: 2024, rules_text: 'reference-only' };
  const entries = [
    ['alchemy-jug', 'Alchemy Jug', { description: 'Choose one liquid described by this item. Its daily production limit is tracked once per dawn.', charges: { max: 1, recovery: 'dawn', restore: 'all' } }],
    ['bag-of-holding', 'Bag of Holding', { description: 'An extradimensional bag holding up to 500 pounds and 64 cubic feet. Retrieving an item takes a Utilize action. Its contents and interactions are adjudicated at the table.', weight: 5 }],
    ['cap-of-water-breathing', 'Cap of Water Breathing', { description: 'While wearing this cap underwater, you can breathe normally.' }],
    ['goggles-of-night', 'Goggles of Night', { description: 'While worn, grant 60-foot Darkvision, or extend existing Darkvision by 60 feet.', effects: [{ type: 'darkvision_extension', value: 60 }] }],
    ['manifold-tool', 'Manifold Tool', { rarity: 'common', requires_attunement: true, description: 'As a Magic action, transform this tool into another kind of Artisan’s Tools. You are proficient with the tool while holding it.' }],
    ['repeating-shot', 'Repeating Shot', { requires_attunement: true, enhancement_bonus: 1, variant: { baseFilter: 'ammunition-weapon', namePrefix: 'Repeating', removeProperties: ['Loading'] }, description: 'This +1 weapon ignores Loading. When loaded without ammunition, it produces magical ammunition for the attack.' }],
    ['returning-weapon', 'Returning Weapon', { enhancement_bonus: 1, variant: { baseFilter: 'thrown-weapon', namePrefix: 'Returning' }, description: 'This +1 weapon returns to your hand immediately after you make a ranged attack with it.' }],
    ['rope-of-climbing', 'Rope of Climbing', { description: 'Use a Magic action to command this 60-foot rope to move, fasten, unfasten, coil, or knot itself. Movement and climbing are resolved at the table.' }],
    ['sending-stones', 'Sending Stones', { description: 'A linked pair of stones. Use a Magic action to cast Sending to the bearer of the other stone. Both stones share the daily use.', charges: { max: 1, recovery: 'dawn', restore: 'all' } }],
    ['shield-plus-1', 'Shield +1', { name: 'Shield', type: 'armor', category: 'Shield', armor_class: '+2', enhancement_bonus: 1, weight: 6, description: 'A shield with an additional +1 bonus to AC.' }],
    ['wand-of-magic-detection', 'Wand of Magic Detection', { spell: { index: 'detect-magic', name: 'Detect Magic', concentration: true }, description: 'Expend 1 charge to cast Detect Magic, without spending a spell slot. The spell requires Concentration.', charges: { max: 3, recovery: 'dawn', restore: '1d3' } }],
    ['wand-of-secrets', 'Wand of Secrets', { description: 'Expend 1 charge as a Magic action to detect the nearest secret door or trap within 60 feet, if any.', charges: { max: 3, recovery: 'dawn', restore: '1d3' } }],
    ['wand-of-the-war-mage-plus-1', 'Wand of the War Mage +1', { name: 'Wand of the War Mage +1', requires_attunement: 'spellcaster', description: 'While holding this wand, gain +1 to spell attack rolls and ignore Half Cover with spell attacks.', effects: [{ type: 'spell_attack_bonus', value: 1 }] }],
    ['weapon-plus-1', 'Weapon +1', { enhancement_bonus: 1, variant: { baseFilter: 'weapon' }, description: 'A magic weapon granting +1 to its attack and damage rolls.' }],
    ['wraps-of-unarmed-power-plus-1', 'Wraps of Unarmed Power +1', { description: 'While worn, gain +1 to attack and damage rolls with Unarmed Strikes; their damage can be Force or its normal type.', effects: [{ type: 'unarmed_bonus', value: 1 }, { type: 'unarmed_damage_type_option', tags: ['force'] }] }],
  ];
  mkdirSync(resolve(root, 'plans'), { recursive: true });
  const plans = entries.map(([id, name, extra]) => {
    const item = { index: id, name, artificer_plan: { name, itemIndex: id }, type: 'magic', category: extra.variant ? 'Magic Weapon Template' : 'Wondrous Item', damage: null, damage_type: null, properties: [], weight: 0, cost: 'Magic item', rarity: 'uncommon', requires_attunement: false, source, ...extra };
    if (item.charges || ['rope-of-climbing', 'manifold-tool'].includes(id)) item.actions = [{ key: 'activate', name, description: item.description, activation: 'action' }];
    writeFileSync(resolve(root, 'items', `${id}.json`), JSON.stringify(item, null, 2) + '\n');
    return { id, name, level: 2, itemIndex: id, baseFilter: extra.variant?.baseFilter };
  });
  const manifestPath = resolve(root, 'manifests', 'eberron-forge-of-the-artificer.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.catalog.items = [...new Set([...manifest.catalog.items, ...plans.map(p => p.itemIndex)])].sort();
  manifest.counts.items = manifest.catalog.items.length;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  plans.push({ id: 'common-magic-item', name: 'Common Magic Item', level: 2, common: true });
  writeFileSync(resolve(root, 'plans', 'magic-item-plans.json'), JSON.stringify(plans, null, 2) + '\n');
}
