import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [rawDirectory] = process.argv.slice(2);
if (!rawDirectory) {
  throw new Error('Usage: node scripts/import-tce-content.mjs <5etools-src-data-directory>');
}

const rawRoot = resolve(rawDirectory);
const contentRoot = resolve('content');
const readRaw = (name) => JSON.parse(readFileSync(resolve(rawRoot, name), 'utf8'));
const readContent = (kind, index) => JSON.parse(
  readFileSync(resolve(contentRoot, kind, `${index}.json`), 'utf8'),
);
const write = (kind, index, value) => {
  const directory = resolve(contentRoot, kind);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${index}.json`), `${JSON.stringify(value, null, 2)}\n`);
};
const assertCount = (label, actual, expected) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
};
const slug = (value) => value.toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const title = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const source = (page) => ({
  code: 'TCE', book: "Tasha's Cauldron of Everything", edition: 2020, page,
  srd_5_2_1: false, rules_text: 'reference-only',
});
const catalog = (entries) => entries.map(entry => ({ index: slug(entry.name), name: entry.name }));
const contentIndexes = (kind) => new Set(readdirSync(resolve(contentRoot, kind))
  .filter(file => file.endsWith('.json'))
  .map(file => file.replace(/\.json$/, '')));
const contentIndexesExcludingSource = (kind, sourceCode) => new Set(
  readdirSync(resolve(contentRoot, kind))
    .filter(file => file.endsWith('.json'))
    .filter(file => {
      const entry = JSON.parse(readFileSync(resolve(contentRoot, kind, file), 'utf8'));
      return entry.source?.code !== sourceCode;
    })
    .map(file => file.replace(/\.json$/, '')),
);

const classIndexes = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin',
  'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
];
const rawClasses = Object.fromEntries(classIndexes.map(index => [
  index, readRaw(`class/class-${index}.json`),
]));
const rawSpells = readRaw('spells/spells-tce.json').spell.filter(entry => entry.source === 'TCE');
const rawFeats = readRaw('feats.json').feat.filter(entry => entry.source === 'TCE');
const rawItems = readRaw('items.json').item.filter(entry => entry.source === 'TCE');
const rawMonsters = readRaw('bestiary/bestiary-tce.json').monster.filter(entry => entry.source === 'TCE');
const rawOptionalFeatures = readRaw('optionalfeatures.json').optionalfeature.filter(entry => entry.source === 'TCE');
const spellSources = readRaw('generated/gendata-spell-source-lookup.json');
const authoredSubclassFeatures = JSON.parse(
  readFileSync(resolve('scripts', 'tce-subclass-features.json'), 'utf8'),
);

assertCount('TCE spells', rawSpells.length, 21);
assertCount('TCE feats', rawFeats.length, 15);
assertCount('TCE magic-item variants', rawItems.length, 84);
assertCount('TCE optional features', rawOptionalFeatures.length, 47);
assertCount('TCE creatures', rawMonsters.length, 20);

const schoolNames = {
  A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment',
  V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation',
};
const attackNames = { M: 'melee', R: 'ranged', O: 'other' };
const durationUnit = (unit, amount) => `${amount} ${unit}${amount === 1 ? '' : 's'}`;
const formatRange = (range) => {
  if (!range || range.type === 'special') return 'Special';
  const distance = range.distance;
  if (!distance) return title(range.type);
  if (distance.type === 'self') return 'Self';
  if (distance.type === 'touch') return 'Touch';
  if (distance.type === 'sight') return 'Sight';
  if (distance.type === 'unlimited') return 'Unlimited';
  return `${distance.amount} ${distance.type}`;
};
const formatDuration = (durations) => {
  const duration = durations?.[0];
  if (!duration) return 'Special';
  if (duration.type === 'instant') return 'Instantaneous';
  if (duration.type === 'special') return 'Special';
  if (duration.type === 'permanent') return 'Until dispelled';
  if (duration.type === 'timed') {
    const text = durationUnit(duration.duration.type, duration.duration.amount);
    return `${duration.concentration ? 'Concentration, up to ' : duration.duration.upTo ? 'Up to ' : ''}${text}`;
  }
  return title(duration.type);
};
const formatCastingTime = (time) => {
  const first = time?.[0];
  if (!first) return 'Special';
  const unit = first.unit === 'bonus' ? 'bonus action' : first.unit;
  return `${first.number} ${unit}${first.number === 1 ? '' : 's'}`;
};
const tagValues = (entries, tag) => {
  const text = JSON.stringify(entries ?? []);
  return [...text.matchAll(new RegExp(`\\{@${tag} ([^}|]+)`, 'g'))].map(match => match[1]);
};
const scaledIncrement = (entries) => {
  const text = JSON.stringify(entries ?? []);
  return [...text.matchAll(/\{@scale(?:damage|dice) [^|}]+\|[^|}]+\|([^|}]+)/g)].map(match => match[1]);
};

const spellDescriptions = {
  'blade-of-disaster': 'Create a planar blade and make two melee spell attacks with it immediately and on later Bonus Actions. Each hit deals 4d12 Force damage; rolls of 18–20 are critical hits that deal three times the normal damage dice.',
  'booming-blade': 'Make a melee weapon attack as part of the spell. On a hit, the target suffers the weapon attack and is wrapped in booming energy that deals Thunder damage if it willingly moves before your next turn.',
  'dream-of-the-blue-veil': 'Transport yourself and willing companions to another world on the Material Plane by using an object connected to that world as the spell focus.',
  'green-flame-blade': 'Make a melee weapon attack as part of the spell. On a hit, green fire leaps to a second creature within 5 feet, dealing Fire damage that scales with your level.',
  'intellect-fortress': 'Protect a creature with Resistance to Psychic damage and Advantage on Intelligence, Wisdom, and Charisma saving throws.',
  'lightning-lure': 'Force a creature within 15 feet to make a Strength save. On a failure, pull it up to 10 feet toward you and deal Lightning damage if it ends within 5 feet.',
  'spirit-shroud': 'Spirits surround you, adding Cold, Necrotic, or Radiant damage to attacks against nearby targets, preventing those targets from regaining Hit Points, and reducing their Speed.',
  'summon-shadowspawn': 'Summon a shadow spirit in one of three emotional forms. It obeys your commands and uses the shared Shadow Spirit stat block, with statistics that scale with the spell slot.',
  'sword-burst': 'Creatures other than you within 5 feet make Dexterity saves, taking Force damage on a failure.',
  'tashas-caustic-brew': 'Spray acid in a 30-foot line. Creatures that fail a Dexterity save take recurring Acid damage until they or another creature spend an Action to remove the acid.',
  'tashas-mind-whip': 'Assault a creature with Psychic damage and, on a failed Intelligence save, prevent Reactions and limit its next turn to only one movement, Action, or Bonus Action.',
  'tashas-otherworldly-guise': 'Assume an upper- or lower-planar form, gaining damage and condition immunities, flight, an AC formula, magical weapon attacks using your spellcasting ability, and Extra Attack.',
};
const spellHigherLevels = {
  'intellect-fortress': 'Target one additional creature for each slot level above 3.',
  'spirit-shroud': 'The extra damage increases by 1d8 for every two slot levels above 3.',
  'summon-shadowspawn': 'Higher slots increase the spirit’s AC, Hit Points, attack modifier, and damage.',
  'tashas-caustic-brew': 'The recurring Acid damage increases by 2d4 for each slot level above 1.',
  'tashas-mind-whip': 'Target one additional creature for each slot level above 2.',
};

const existingSpellIndexes = contentIndexesExcludingSource('spells', 'TCE');
const spellReprints = rawSpells.filter(spell => existingSpellIndexes.has(slug(spell.name)));
const importedSpells = rawSpells.filter(spell => !existingSpellIndexes.has(slug(spell.name)));
assertCount('TCE spell reprints supplied by PHB 2024', spellReprints.length, 9);
assertCount('new TCE spells', importedSpells.length, 12);

for (const spell of importedSpells) {
  const index = slug(spell.name);
  const description = spellDescriptions[index];
  if (!description) throw new Error(`Missing authored TCE spell summary: ${spell.name}`);
  const components = Object.entries(spell.components ?? {})
    .filter(([, present]) => Boolean(present))
    .map(([component]) => component.toUpperCase());
  const material = typeof spell.components?.m === 'string'
    ? spell.components.m
    : spell.components?.m?.text;
  const cantripScale = [...new Set(scaledIncrement(spell.entriesHigherLevel))];
  write('spells', index, {
    index, name: spell.name, level: spell.level, school: schoolNames[spell.school],
    casting_time: formatCastingTime(spell.time), range: formatRange(spell.range),
    components, ...(material ? { material } : {}), duration: formatDuration(spell.duration),
    ritual: spell.meta?.ritual === true,
    concentration: spell.duration?.some(duration => duration.concentration === true) ?? false,
    mechanics: {
      spell_attacks: (spell.spellAttack ?? []).map(value => attackNames[value] ?? value.toLowerCase()),
      saving_throws: spell.savingThrow ?? [], ability_checks: spell.abilityCheck ?? [],
      damage_types: spell.damageInflict ?? [], conditions: spell.conditionInflict ?? [],
      affects_creature_types: spell.affectsCreatureType ?? [],
      grants_damage_immunities: spell.immune ?? [], grants_damage_resistances: spell.resist ?? [],
      grants_damage_vulnerabilities: spell.vulnerable ?? [],
      grants_condition_immunities: spell.conditionImmune ?? [],
      area_tags: spell.areaTags ?? [], misc_tags: spell.miscTags ?? [],
    },
    description,
    ...(spell.level === 0 && cantripScale.length
      ? { cantrip_upgrade: `The damage increases by ${cantripScale.join(' or ')} at the normal cantrip levels.` }
      : {}),
    ...(spell.level > 0 && spellHigherLevels[index]
      ? { higher_levels: spellHigherLevels[index] }
      : {}),
    source: source(spell.page),
  });
}

const spellAliases = { 'branding-smite': 'shining-smite' };
const localSpellIndexes = new Set([...existingSpellIndexes, ...importedSpells.map(spell => slug(spell.name))]);
const spellListAdditions = {};
const addSpell = (className, spellName) => {
  const classIndex = slug(className);
  const rawIndex = slug(spellName.replace(/#c$/, ''));
  const spellIndex = spellAliases[rawIndex] ?? rawIndex;
  if (!classIndexes.includes(classIndex) || !localSpellIndexes.has(spellIndex)) return;
  (spellListAdditions[classIndex] ??= new Set()).add(spellIndex);
};
for (const [spellSource, sourceSpells] of Object.entries(spellSources)) {
  for (const [spellName, access] of Object.entries(sourceSpells)) {
    if (spellSource === 'tce') {
      for (const className of Object.keys(access.class?.PHB ?? access.class?.XPHB ?? {})) {
        addSpell(className, spellName);
      }
    }
    for (const edition of ['PHB', 'XPHB']) {
      for (const [className, details] of Object.entries(access.classVariant?.[edition] ?? {})) {
        if (details?.definedInSources?.includes('TCE')) addSpell(className, spellName);
      }
    }
  }
}
for (const [classIndex, spells] of Object.entries(spellListAdditions)) {
  spellListAdditions[classIndex] = [...spells].sort();
}

const findGrant = (value, predicate) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findGrant(entry, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  if (predicate(value)) return value;
  for (const entry of Object.values(value)) {
    const found = findGrant(entry, predicate);
    if (found) return found;
  }
  return undefined;
};
const warlockInvocations = findGrant(
  readContent('classes', 'warlock'),
  grant => grant.type === 'choice' && grant.key === 'eldritch_invocations',
)?.options ?? [];
const metamagicOptions = findGrant(
  readContent('classes', 'sorcerer'),
  grant => grant.type === 'choice' && grant.key === 'metamagic',
)?.options ?? [];

const featDefinitions = {
  'artificer-initiate': {
    description: 'Learn one Artificer cantrip and one level 1 Artificer spell, gain an artisan tool proficiency, and use that tool as a spellcasting focus for the granted spells.',
    grants: [
      { type: 'spell_grant', key: 'artificer_initiate_cantrip', name: 'Artificer Initiate Cantrip', destination: 'known', choose: 1, countsAgainstLimit: false, sourceKey: 'artificer-initiate', sourceName: 'Artificer Initiate', ability: 'intelligence', filter: { lists: ['Artificer'], exactLevels: [0] } },
      { type: 'spell_grant', key: 'artificer_initiate_spell', name: 'Artificer Initiate Spell', destination: 'always_prepared', choose: 1, countsAgainstLimit: false, sourceKey: 'artificer-initiate', sourceName: 'Artificer Initiate', ability: 'intelligence', filter: { lists: ['Artificer'], exactLevels: [1] }, freeCast: { uses: 1, recovery: 'long_rest' } },
      { type: 'feature', name: 'Artisan Tool Training', description: 'Gain proficiency with one type of artisan tool and use it as a spellcasting focus for this feat’s spells.' },
    ],
  },
  'eldritch-adept': {
    description: 'Learn one Eldritch Invocation for which you qualify; replace it whenever you gain a level.',
    prerequisite: { spellcasting: true },
    grants: [{ type: 'choice', key: 'eldritch_adept_invocation', name: 'Eldritch Adept Invocation', choose: 1, options: warlockInvocations }],
  },
  'fighting-initiate': {
    description: 'Learn one Fighting Style available in the campaign and replace it whenever you gain a level.',
    grants: [{ type: 'feat_pick', key: 'fighting_initiate_style', name: 'Fighting Initiate Style', choose: 1, category: 'fighting_style' }],
  },
  gunner: {
    description: 'Gain firearm proficiency, ignore the Loading property, and make ranged attacks within 5 feet without Disadvantage.',
    prerequisite: { abilities: ['dexterity'], min: 13 },
    abilityIncrease: { abilities: ['dexterity'], amount: 1 },
    effects: [{ type: 'weapon_proficiency', tags: ['firearm'] }],
  },
  'metamagic-adept': {
    description: 'Learn two Metamagic options and gain 2 Sorcery Points that can be spent only on Metamagic and return on a Long Rest.',
    grants: [
      { type: 'choice', key: 'metamagic_adept_options', name: 'Metamagic Adept Options', choose: 2, options: metamagicOptions },
      { type: 'feature', key: 'metamagic_adept_points', name: 'Metamagic Adept Sorcery Points', description: 'You have 2 Sorcery Points usable only for Metamagic; both return on a Long Rest.', action: { activation: 'free', uses: { max: 2, per: 'long_rest' } } },
    ],
  },
};
const existingFeatIndexes = contentIndexesExcludingSource('feats', 'TCE');
const featReprints = rawFeats.filter(feat => existingFeatIndexes.has(slug(feat.name)));
const importedFeats = rawFeats.filter(feat => !existingFeatIndexes.has(slug(feat.name)));
assertCount('TCE feat reprints supplied by PHB 2024', featReprints.length, 10);
assertCount('new TCE feats', importedFeats.length, 5);
for (const feat of importedFeats) {
  const index = slug(feat.name);
  const definition = featDefinitions[index];
  if (!definition) throw new Error(`Missing authored TCE feat definition: ${feat.name}`);
  write('feats', index, {
    index, name: feat.name, description: definition.description, category: 'general',
    prerequisite: { level: 4, ...definition.prerequisite },
    ...(definition.abilityIncrease ? { abilityIncrease: definition.abilityIncrease } : {}),
    ...(definition.effects ? { effects: definition.effects } : {}),
    ...(definition.grants ? { grants: definition.grants } : {}),
    source: source(feat.page),
  });
}

const itemDescriptions = {
  'alchemical-compendium': 'An alchemical spellbook and focus that can transmute a nearby nonmagical object and spend charges to cast its recorded spells.',
  'astral-shard': 'A Sorcerer focus that teleports you up to 30 feet whenever you apply Metamagic to a spell.',
  'astromancy-archive': 'A divination spellbook and focus whose charges cast divinations or influence a nearby d20 roll.',
  'atlas-of-endless-horizons': 'A conjuration spellbook and focus whose charges cast teleportation magic and can move you away from an attack.',
  'baba-yagas-mortar-and-pestle': 'An artifact mortar and pestle that creates ingredients, summons spectral tools, grinds magical paste, and travels through the air or between destinations.',
  'baba-yagas-pestle': 'The weapon component of Baba Yaga’s artifact; it functions as a powerful magic quarterstaff while held.',
  'bell-branch': 'A Druid focus whose charges cast Protection from Evil and Good and can suppress nearby extraplanar creatures.',
  'blood-fury-tattoo': 'A legendary tattoo whose charges empower weapon hits with Necrotic damage and healing or retaliate against a creature that damages you.',
  'cauldron-of-rebirth': 'A Druid focus that improves restorative magic, brews healing potions, and can return a recently dead creature to life.',
  'coiling-grasp-tattoo': 'A tattoo that projects an inky tendril to grapple and damage a creature within 15 feet.',
  'crook-of-rao': 'An artifact staff that protects against fiends and can attempt to banish extraplanar creatures, with unpredictable consequences.',
  'crystalline-chronicle': 'A Sorcerer focus that grants several Psionic spells and spends charges to alter spells without Sorcery Point costs.',
  'demonomicon-of-iggwilv': 'An artifact tome that grants occult knowledge, stores fiends, and can imprison extraplanar creatures within its pages.',
  'devotees-censer': 'A magic flail that deals extra Radiant damage and can release a healing cloud once per day.',
  'duplicitous-manuscript': 'An illusion spellbook and focus whose charges cast deceptive magic and can impose Disadvantage on Insight checks.',
  'eldritch-claw-tattoo': 'A tattoo that makes unarmed strikes magical and can extend their reach while adding Force damage.',
  'elemental-essence-shard': 'A Sorcerer focus that triggers an elemental benefit whenever you apply Metamagic to a spell.',
  'far-realm-shard': 'A Sorcerer focus that can deal Psychic damage and Frighten a nearby creature after you use Metamagic.',
  'feywild-shard': 'A Sorcerer focus that can trigger a Wild Magic Surge when you use Metamagic.',
  'fulminating-treatise': 'An evocation spellbook and focus whose charges empower elemental spell damage or knock a creature Prone.',
  'ghost-step-tattoo': 'A tattoo that can make you briefly incorporeal, granting damage resistance and movement through creatures and objects.',
  'guardian-emblem': 'An emblem attached to armor or a shield that can turn a nearby critical hit into a normal hit.',
  'heart-weavers-primer': 'An enchantment spellbook and focus whose charges cast charms and can impose Disadvantage on a save against one of your Enchantment spells.',
  'illuminators-tattoo': 'A tattoo that writes with a fingertip and can hide its writing from everyone except chosen readers.',
  'libram-of-souls-and-flesh': 'A necromancy spellbook and focus that can make you appear undead and grants access to several Necromancy spells.',
  'lifewell-tattoo': 'A tattoo that grants Resistance to Necrotic damage and can leave you at 1 Hit Point instead of 0 once per day.',
  'lubas-tarokka-of-souls': 'An artifact deck that manipulates spirits, grants divinatory magic, and carries a dangerous curse.',
  'lyre-of-building': 'A magical instrument that protects structures, constructs objects, and can repair damaged buildings.',
  'masquerade-tattoo': 'A tattoo that changes its appearance and can cast Disguise Self once per day.',
  'mighty-servant-of-leuk-o': 'An artifact war machine that can be piloted from within and has formidable movement, defenses, and destructive attacks.',
  'natures-mantle': 'A Druid or Ranger focus that can hide its wearer as a Bonus Action while lightly obscured.',
  'outer-essence-shard': 'A Sorcerer focus that triggers a planar-alignment benefit whenever you apply Metamagic to a spell.',
  'planecallers-codex': 'A conjuration spellbook and focus whose charges call planar creatures and can reinforce a summoned creature.',
  'prosthetic-limb': 'A magical replacement limb that attaches to a creature and functions like the body part it replaces.',
  'protective-verses': 'An abjuration spellbook and focus whose charges create protective wards and can grant temporary Hit Points when you cast Abjuration magic.',
  'revelers-concertina': 'A Bard instrument that improves Bard spell attacks and save DCs and can cast Otto’s Irresistible Dance once per day.',
  'shadowfell-brand-tattoo': 'A tattoo that grants Darkvision, improves Stealth, and can halve damage from one attack each day.',
  'shadowfell-shard': 'A Sorcerer focus that can impose Disadvantage on one ability’s checks after you use Metamagic.',
  'teeth-of-dahlver-nar': 'An artifact collection of magical teeth, each producing a different implanted or sown effect.',
};
const itemDescription = (item) => {
  const index = slug(item.name);
  if (/^\d-all-purpose-tool$/.test(index)) return `An Artificer focus that grants its listed bonus to spell attacks and save DCs, transforms into artisan tools, and temporarily provides an Artificer cantrip.`;
  if (/^\d-amulet-of-the-devout$/.test(index)) return 'A Cleric or Paladin focus that grants its listed bonus to spell attacks and save DCs and provides one additional Channel Divinity use each day.';
  if (/^\d-arcane-grimoire$/.test(index)) return 'A Wizard spellbook and focus that grants its listed bonus to spell attacks and save DCs and improves Arcane Recovery.';
  if (/^\d-bloodwell-vial$/.test(index)) return 'A Sorcerer focus that grants its listed bonus to spell attacks and save DCs and restores Sorcery Points when Hit Dice are spent.';
  if (/^\d-moon-sickle$/.test(index)) return 'A Druid or Ranger weapon and focus that grants its listed spell bonus and improves healing spells.';
  if (/^\d-rhythm-makers-drum$/.test(index)) return 'A Bard focus that grants its listed bonus to spell attacks and save DCs and can restore Bardic Inspiration.';
  if (/absorbing-tattoo$/.test(index)) return `A tattoo that grants Resistance to ${title(index.split('-')[0])} damage and can absorb one instance of that damage each day, converting it into healing.`;
  if (/^barrier-tattoo-/.test(index)) return 'A protective tattoo that supplies an armor-class formula while you are not wearing armor.';
  if (/^elemental-essence-shard-/.test(index)) return `${itemDescriptions['elemental-essence-shard']} This variant channels ${title(index.split('-').at(-1))}.`;
  if (/^outer-essence-shard-/.test(index)) return `${itemDescriptions['outer-essence-shard']} This variant channels ${title(index.split('-').at(-1))} essence.`;
  if (/^spellwrought-tattoo-/.test(index)) return 'A consumable tattoo containing one spell of the listed level; the bearer can cast it once without material components.';
  return itemDescriptions[index];
};
for (const item of rawItems) {
  const index = slug(item.name);
  const description = itemDescription(item);
  if (!description) throw new Error(`Missing authored TCE item summary: ${item.name}`);
  const bonus = Number(String(item.bonusSpellAttack ?? item.bonusWeapon ?? '').replace('+', ''));
  write('items', index, {
    index, name: item.name, type: 'gear',
    category: item.wondrous ? 'Wondrous Item' : item.staff ? 'Staff' : item.type === 'M' ? 'Magic Weapon' : 'Magic Item',
    damage: null, damage_type: null, properties: [], weight: item.weight ?? 0,
    cost: 'Magic item', description, rarity: item.rarity ?? 'varies',
    ...(item.reqAttune ? { requires_attunement: item.reqAttune } : {}),
    ...(Number.isFinite(bonus) && bonus > 0 ? { magic_bonus: bonus } : {}),
    ...(item.charges ? { charges: { max: item.charges, recovery: item.recharge === 'dawn' ? 'dawn' : 'long_rest' } } : {}),
    source: source(item.page),
  });
}

const normalizeAc = (value) => {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'number') return first;
  if (first && typeof first === 'object') return Number(first.ac ?? 10);
  return 10;
};
const speedValue = (value) => typeof value === 'number' ? value : Number(value?.number ?? 0);
const normalizeSpeed = (speed) => Object.fromEntries(Object.entries(speed ?? {})
  .filter(([key]) => ['walk', 'fly', 'swim', 'climb', 'burrow'].includes(key))
  .map(([key, value]) => [key, speedValue(value)]));
const normalizeNamedValues = (values) => Object.fromEntries(Object.entries(values ?? {})
  .map(([key, value]) => [key.replace(/^save /, ''), String(value)]));
const normalizeDefense = (value) => (value ?? []).flatMap(entry => {
  if (typeof entry === 'string') return [entry];
  if (entry && typeof entry === 'object') return entry.resist ?? entry.immune ?? entry.vulnerable ?? entry.conditionImmune ?? [];
  return [];
}).map(String);
const normalizeSenses = (monster) => {
  const senses = { passive_perception: Number(monster.passive ?? 10) };
  for (const entry of monster.senses ?? []) {
    const match = entry.match(/^(darkvision|blindsight|tremorsense|truesight)\s+(\d+)/i);
    if (match) senses[match[1].toLowerCase()] = Number(match[2]);
  }
  return senses;
};
const crValue = (cr) => typeof cr === 'object' ? String(cr.cr ?? 'Special') : String(cr ?? 'Special');
const summarizeStatEntry = (entry, page) => {
  const text = JSON.stringify(entry.entries ?? []);
  const hit = text.match(/\{@hit ([^}]+)}/)?.[1];
  const damage = [...text.matchAll(/\{@damage ([^}|]+)[^}]*}/g)].map(match => match[1]);
  const save = text.match(/\{@dc (\d+)}/)?.[1];
  const parts = [];
  if (hit) parts.push(`${hit.startsWith('+') ? hit : `+${hit}`} to hit`);
  if (damage.length) parts.push(`damage dice ${[...new Set(damage)].join(' plus ')}`);
  if (save) parts.push(`save DC ${save}`);
  return parts.length
    ? `${parts.join('; ')}. See Tasha's Cauldron of Everything, page ${page}, for targeting and additional effects.`
    : `A structured ${entry.name.toLowerCase()} rule from Tasha's Cauldron of Everything, page ${page}.`;
};
const existingMonsterIndexes = contentIndexesExcludingSource('monsters', 'TCE');
const monsterReprints = rawMonsters.filter(monster => existingMonsterIndexes.has(slug(monster.name)));
const importedMonsters = rawMonsters.filter(monster => !existingMonsterIndexes.has(slug(monster.name)));
assertCount('TCE creatures supplied by Eberron', monsterReprints.length, 2);
assertCount('new TCE creatures', importedMonsters.length, 18);
for (const monster of importedMonsters) {
  const index = slug(monster.name);
  write('monsters', index, {
    index, name: monster.name, size: Array.isArray(monster.size) ? monster.size.join('/') : monster.size,
    type: typeof monster.type === 'string' ? monster.type : monster.type?.type ?? 'creature',
    alignment: Array.isArray(monster.alignment) ? monster.alignment.join(' ') : monster.alignment ?? 'Unaligned',
    armor_class: normalizeAc(monster.ac), hit_points: Number(monster.hp?.average ?? 0),
    hit_points_formula: monster.hp?.formula ?? 'Special', hit_dice: monster.hp?.formula ?? 'Special',
    speed: normalizeSpeed(monster.speed),
    ability_scores: {
      strength: Number(monster.str ?? 10), dexterity: Number(monster.dex ?? 10),
      constitution: Number(monster.con ?? 10), intelligence: Number(monster.int ?? 10),
      wisdom: Number(monster.wis ?? 10), charisma: Number(monster.cha ?? 10),
    },
    saving_throws: normalizeNamedValues(monster.save), skills: normalizeNamedValues(monster.skill),
    damage_vulnerabilities: normalizeDefense(monster.vulnerable),
    damage_resistances: normalizeDefense(monster.resist),
    damage_immunities: normalizeDefense(monster.immune),
    condition_immunities: normalizeDefense(monster.conditionImmune),
    senses: normalizeSenses(monster), languages: monster.languages ?? [],
    challenge_rating: crValue(monster.cr), xp: 0,
    traits: (monster.trait ?? []).map(entry => ({ name: entry.name, description: summarizeStatEntry(entry, monster.page) })),
    actions: (monster.action ?? []).map(entry => ({ name: entry.name, description: summarizeStatEntry(entry, monster.page) })),
    reactions: (monster.reaction ?? []).map(entry => ({ name: entry.name, description: summarizeStatEntry(entry, monster.page) })),
    legendary_actions: (monster.legendary ?? []).map(entry => ({ name: entry.name, description: summarizeStatEntry(entry, monster.page) })),
    description: `A creature, companion, or summoned spirit stat block from Tasha's Cauldron of Everything.`,
    rules_text: 'reference-only', source: source(monster.page),
  });
}

const subclassMilestones = {
  barbarian: [3, 6, 10, 14], bard: [3, 6, 14], cleric: [3, 6, 17],
  druid: [3, 6, 10, 14], fighter: [3, 7, 10, 15, 18], monk: [3, 6, 11, 17],
  paladin: [3, 7, 15, 20], ranger: [3, 7, 11, 15], rogue: [3, 9, 13, 17],
  sorcerer: [3, 6, 14, 18], warlock: [3, 6, 10, 14], wizard: [3, 6, 10, 14],
};
const phbSubclassReprints = new Set([
  'druid:stars', 'fighter:psi-warrior', 'monk:mercy', 'paladin:glory',
  'ranger:fey-wanderer', 'rogue:soulknife', 'sorcerer:aberrant-mind',
  'sorcerer:clockwork-soul',
]);
const nearestMilestone = (classIndex, level) => [...subclassMilestones[classIndex]]
  .sort((left, right) => Math.abs(left - level) - Math.abs(right - level) || left - right)[0];
const collectSpellReferences = (value) => {
  if (typeof value === 'string') {
    const rawIndex = slug(value.split('|')[0].replace(/#c$/, ''));
    return [spellAliases[rawIndex] ?? rawIndex];
  }
  if (Array.isArray(value)) return value.flatMap(collectSpellReferences);
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(collectSpellReferences);
};
const threshold = (rawLevel) => Math.max(3, Number(String(rawLevel).replace(/^s/, '')) || 3);
const additionalSpellGrants = (classIndex, subclass) => {
  if (classIndex === 'warlock' && subclass.shortName === 'Genie') {
    const damageTypes = { Dao: 'bludgeoning', Djinni: 'thunder', Efreeti: 'fire', Marid: 'cold' };
    return [{
      type: 'choice', key: 'genie_kind', name: 'Genie Kind', choose: 1,
      description: 'Choose the kind of genie who serves as your patron.',
      options: subclass.additionalSpells.map(block => ({
        name: block.name,
        description: `Your patron is a ${block.name}; Genie's Wrath and Elemental Gift use ${title(damageTypes[block.name])} damage.`,
        effects: [{ type: 'damage_resistance', tags: [damageTypes[block.name]] }],
        grants: [{
          type: 'spell_list_expansion', key: `genie_${slug(block.name)}_spells`,
          name: `${block.name} Expanded Spells`, spells: [...new Set(collectSpellReferences(block.expanded))],
        }],
      })),
    }];
  }
  const grouped = new Map();
  for (const block of subclass.additionalSpells ?? []) {
    for (const destination of ['prepared', 'known', 'innate', 'expanded']) {
      for (const [rawLevel, value] of Object.entries(block[destination] ?? {})) {
        const level = threshold(rawLevel);
        const key = `${destination}:${level}`;
        const current = grouped.get(key) ?? { destination, level, spells: [] };
        current.spells.push(...collectSpellReferences(value));
        grouped.set(key, current);
      }
    }
  }
  return [...grouped.values()].map(group => group.destination === 'expanded'
    ? {
        type: 'spell_list_expansion', key: `${slug(subclass.shortName)}_expanded_${group.level}`,
        name: `${subclass.shortName} Expanded Spells`, spells: [...new Set(group.spells)],
      }
    : {
        type: 'spell_grant', key: `${slug(subclass.shortName)}_spells_${group.level}`,
        name: `${subclass.shortName} Spells`,
        destination: group.destination === 'prepared' ? 'always_prepared' : 'known',
        spells: [...new Set(group.spells)], countsAgainstLimit: false, classLevel: group.level,
        ...(group.destination === 'innate' ? { freeCast: { uses: 1, recovery: 'long_rest' } } : {}),
      });
};
const runeOptions = [
  ['Cloud Rune', 'Gain Advantage on Sleight of Hand and Deception. Invoke it as a Reaction to redirect a nearby attack to a different target.'],
  ['Fire Rune', 'Double proficiency with proficient tools. On a hit, invoke it to deal Fire damage and restrain the target with fiery shackles.'],
  ['Frost Rune', 'Gain Advantage on Animal Handling and Intimidation. Invoke it for a 10-minute bonus to Strength and Constitution checks and saves.'],
  ['Stone Rune', 'Gain Advantage on Insight and 120-foot Darkvision. Invoke it as a Reaction to charm and incapacitate a nearby creature.'],
  ['Hill Rune', 'Gain Advantage on saves against Poison and Resistance to Poison damage. Invoke it to gain Resistance to physical weapon damage for 1 minute.'],
  ['Storm Rune', 'Gain Advantage on Arcana and immunity to surprise. Invoke it for 1 minute to use Reactions to grant Advantage or Disadvantage on nearby d20 rolls.'],
].map(([name, description], position) => ({
  name, description, prerequisite: position >= 4 ? { level: 7 } : undefined,
}));
const obsoleteSubclassFeatures = new Set([
  'Blessed Strikes', 'Divine Strike', 'Potent Spellcasting', 'Additional Rune Known',
  'Channel Divinity', 'Oath Spells',
]);
const companionBySubclass = {
  'bard:creation': ['dancing-item', 'Dancing Item'],
  'druid:wildfire': ['wildfire-spirit', 'Wildfire Spirit'],
};

const importedSubclasses = [];
const reprintedSubclasses = [];
const usedSubclassFeatureKeys = new Set();
for (const classIndex of classIndexes) {
  const data = rawClasses[classIndex];
  const subclasses = (data.subclass ?? []).filter(entry =>
    entry.source === 'TCE' && entry.classSource === 'PHB');
  for (const subclass of subclasses) {
    const index = slug(subclass.shortName);
    if (phbSubclassReprints.has(`${classIndex}:${index}`)) {
      reprintedSubclasses.push({ class_index: classIndex, index, name: subclass.name });
      continue;
    }
    const levelMap = new Map(subclassMilestones[classIndex].map(level => [level, []]));
    const features = (data.subclassFeature ?? []).filter(feature =>
      feature.source === 'TCE'
      && feature.classSource === 'PHB'
      && feature.subclassShortName === subclass.shortName);
    for (const entry of features) {
      if (entry.name === subclass.name || entry.name === subclass.shortName || obsoleteSubclassFeatures.has(entry.name)) continue;
      if (classIndex === 'fighter' && index === 'rune-knight' && entry.name === 'Rune Carver') continue;
      const authoredKey = `${classIndex}:${index}:${slug(entry.name)}`;
      const authored = authoredSubclassFeatures[authoredKey];
      if (!authored) throw new Error(`Missing authored TCE subclass feature: ${authoredKey}`);
      usedSubclassFeatureKeys.add(authoredKey);
      const grants = levelMap.get(nearestMilestone(classIndex, entry.level));
      if (!grants.some(grant => grant.name === entry.name)) {
        grants.push({
          type: 'feature', name: entry.name, ...authored,
          ...(authored.action ? { key: `tce_${classIndex}_${index}_${slug(entry.name)}` } : {}),
        });
      }
    }
    const firstLevel = subclassMilestones[classIndex][0];
    levelMap.get(firstLevel).unshift(...additionalSpellGrants(classIndex, subclass));
    if (classIndex === 'fighter' && index === 'rune-knight') {
      levelMap.get(firstLevel).unshift({
        type: 'choice', key: 'rune_carver', name: 'Rune Carver', choose: 2,
        chooseByLevel: { 3: 2, 7: 3, 10: 4, 15: 5 },
        description: 'Choose runes known. Each rune grants a passive benefit and can be invoked once per Long Rest.',
        options: runeOptions,
      });
    }
    const companion = companionBySubclass[`${classIndex}:${index}`];
    if (companion) levelMap.get(firstLevel).unshift({
      type: 'companion_grant', key: `${index}_companion`, name: companion[1],
      monsterIndex: companion[0], description: `Use the shared ${companion[1]} stat block.`,
    });
    for (const [level, grants] of levelMap) {
      const deduplicated = grants.filter((grant, position, all) =>
        !all.some((candidate, candidatePosition) =>
          candidatePosition < position && candidate.name === grant.name));
      levelMap.set(level, deduplicated);
    }
    const levels = [...levelMap.entries()].map(([level, grants]) => ({
      level, features: [...new Set(grants.map(grant => grant.name))],
      ...(grants.length ? { grants } : {}),
    }));
    const output = {
      class_index: classIndex, index, name: subclass.name,
      description: `A ${classIndex} subclass that adds the ${subclass.shortName} tradition from Tasha's Cauldron of Everything.`,
      levels, source: source(subclass.page),
    };
    importedSubclasses.push(output);
    write('subclasses', `${classIndex}-${index}`, output);
  }
}
assertCount('published TCE PHB-class subclasses', importedSubclasses.length + reprintedSubclasses.length, 26);
assertCount('new TCE subclasses', importedSubclasses.length, 18);
assertCount('TCE subclass reprints supplied by PHB 2024', reprintedSubclasses.length, 8);
const unusedSubclassFeatureKeys = Object.keys(authoredSubclassFeatures)
  .filter(key => !usedSubclassFeatureKeys.has(key))
  .filter(key => key !== 'fighter:rune-knight:rune-carver');
if (unusedSubclassFeatureKeys.length) {
  throw new Error(`Unused authored TCE subclass features: ${unusedSubclassFeatureKeys.join(', ')}`);
}

const artificerSubclasses = ['Alchemist', 'Armorer', 'Artillerist', 'Battle Smith'].map(name => ({
  class_index: 'artificer', index: slug(name), name,
}));
const legacyOptionalFeatureDescriptions = {
  'arcane-propulsion-armor': 'Turn an attuned suit of armor into a powered prosthetic that cannot be removed against your will, increases Speed, and provides force-powered gauntlet weapons.',
  'armor-of-magical-strength': 'Add charges to armor that can apply Intelligence to a Strength check or save and can prevent the wearer from being knocked Prone.',
  'bond-of-the-talisman': 'While another creature wears your Pact Talisman, either of you can teleport to the other as an Action a limited number of times.',
  brace: 'When a creature enters your melee reach, expend a Superiority Die and use your Reaction to attack it, adding the die to the damage on a hit.',
  'enhanced-arcane-focus': 'Improve a spellcasting focus with a bonus to spell attacks and the ability to ignore Half Cover; the bonus increases at higher Artificer levels.',
  'enhanced-defense': 'Improve armor or a shield with an AC bonus that increases at higher Artificer levels.',
  'enhanced-weapon': 'Improve a weapon with a bonus to attack and damage rolls that increases at higher Artificer levels.',
  'far-scribe': 'Record names in your Book of Shadows and cast Sending without a spell slot or components, targeting a creature whose name is recorded.',
  'grappling-strike': 'After hitting with a melee attack, expend a Superiority Die and use a Bonus Action to grapple the target, adding the die to the Athletics check.',
  'homunculus-servant': 'Create a Homunculus Servant companion whose defenses, Hit Points, attacks, and checks scale with your Artificer statistics.',
  'pact-of-the-talisman': 'Give the talisman’s wearer a d4 bonus after a failed ability check, with uses tied to Proficiency Bonus.',
  'protection-of-the-talisman': 'When the talisman’s wearer fails a saving throw, add 1d4 to the roll a limited number of times per Long Rest.',
  'quick-toss': 'As a Bonus Action, expend a Superiority Die to draw and throw a weapon, adding the die to the attack’s damage on a hit.',
  'radiant-weapon': 'Improve a weapon with an attack and damage bonus, adjustable light, and charges that can Blind a creature after it hits the wielder.',
  'rebuke-of-the-talisman': 'When the talisman’s wearer is hit nearby, use your Reaction to deal Psychic damage to the attacker and push it away.',
  'resistant-armor': 'Infuse armor to grant its wearer Resistance to one selected damage type.',
  'superior-technique': 'Learn one Battle Master maneuver and gain one d6 Superiority Die that returns on a Short or Long Rest.',
  'undying-servitude': 'Cast Animate Dead once without a spell slot each Long Rest.',
};
const hostOptionalFeatureProviders = [
  ...readdirSync(resolve(contentRoot, 'classes'))
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(resolve(contentRoot, 'classes', file), 'utf8'))),
  ...readdirSync(resolve(contentRoot, 'feats'))
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(resolve(contentRoot, 'feats', file), 'utf8')))
    .filter(feat => feat.source?.code !== 'TCE'),
  ...readdirSync(resolve(contentRoot, 'items'))
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(resolve(contentRoot, 'items', file), 'utf8')))
    .filter(item => item.source?.code !== 'TCE'),
];
const subclassImplementedOptionalFeatures = new Map(runeOptions.map(option => [
  option.name, option.description,
]));
const optionalFeatureCatalog = rawOptionalFeatures.map(entry => {
  const hostEntry = findGrant(hostOptionalFeatureProviders, candidate =>
    candidate.name === entry.name && typeof candidate.description === 'string');
  const subclassDescription = subclassImplementedOptionalFeatures.get(entry.name);
  const legacyDescription = legacyOptionalFeatureDescriptions[slug(entry.name)];
  const description = hostEntry?.description ?? subclassDescription ?? legacyDescription;
  if (!description) throw new Error(`Missing TCE optional-feature summary: ${entry.name}`);
  return {
    index: slug(entry.name), name: entry.name, description,
    feature_types: entry.featureType ?? [], page: entry.page,
    status: hostEntry
      ? 'supplied_by_host_2024'
      : subclassDescription
        ? 'implemented_by_tce_subclass'
        : 'legacy_reference',
  };
});
write('manifests', 'tashas-cauldron-of-everything', {
  source: { code: 'TCE', name: "Tasha's Cauldron of Everything", edition: 2020, rules_text: 'reference-only' },
  compatibility: {
    rules_origin: '2014 legacy content', host_rules: '2024 core classes',
    subclass_levels: 'Legacy subclass features are grouped into the nearest 2024 subclass milestone.',
    duplicate_policy: 'PHB 2024 and Eberron: Forge of the Artificer versions remain authoritative when content was reprinted.',
    spell_aliases: spellAliases,
  },
  counts: {
    published_phb_class_subclasses: 26, imported_subclasses: 18, phb_2024_subclass_reprints: 8,
    artificer_subclasses_supplied_by_efa: 4,
    published_spells: 21, imported_spells: 12, phb_2024_spell_reprints: 9,
    published_feats: 15, imported_feats: 5, phb_2024_feat_reprints: 10,
    published_magic_items: 47, selectable_magic_item_variants: 84,
    creatures: 20, imported_creatures: 18, creatures_supplied_by_efa: 2,
    optional_feature_entries: 47,
  },
  catalog: {
    subclasses: importedSubclasses.map(entry => ({ class_index: entry.class_index, index: entry.index, name: entry.name })),
    feats: catalog(importedFeats), spells: catalog(importedSpells),
    magic_item_variants: catalog(rawItems), creatures: catalog(importedMonsters),
    optional_features: optionalFeatureCatalog,
  },
  supplied_by_phb_2024: {
    subclasses: reprintedSubclasses, feats: catalog(featReprints), spells: catalog(spellReprints),
  },
  supplied_by_eberron_forge_of_the_artificer: {
    subclasses: artificerSubclasses, creatures: catalog(monsterReprints),
  },
  spell_list_additions: spellListAdditions,
  implementation: {
    structured: [
      'source gating', 'subclass selection', 'subclass feature mechanics and actions',
      'subclass spell grants and expansions', 'feat prerequisites and choices',
      'class spell-list additions', 'spell metadata and scaling', 'magic-item variants',
      'summoned creature and companion stat blocks',
    ],
    host_2024_equivalents: [
      'optional class-feature replacements', 'fighting styles', 'metamagic options',
      'eldritch invocations', 'Battle Master maneuvers', 'Artificer infusions',
    ],
    optional_feature_policy: 'Every legacy optional feature is inventoried with a rules summary and an implementation status. Reprinted 2024/Eberron options are not duplicated into class progressions.',
    descriptive_reference: ['bespoke spell automation', 'complex magic-item activations', 'summoned-creature bespoke traits'],
  },
  non_catalog_book_systems: [
    'customizing your origin', 'changing a skill or subclass', 'group patrons',
    'session zero guidance', 'sidekick classes', 'parleying with monsters',
    'supernatural regions', 'magical phenomena', 'natural hazards', 'puzzles',
  ],
});

console.log(
  `Imported ${importedSubclasses.length} subclasses, ${importedSpells.length} spells, `
  + `${importedFeats.length} feats, ${rawItems.length} item variants, and ${importedMonsters.length} creatures.`,
);
