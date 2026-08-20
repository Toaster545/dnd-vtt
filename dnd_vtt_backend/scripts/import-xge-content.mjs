import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [rawDirectory] = process.argv.slice(2);
if (!rawDirectory) {
  throw new Error('Usage: node scripts/import-xge-content.mjs <5etools-2014-src-data-directory>');
}

const rawRoot = resolve(rawDirectory);
const read = (name) => JSON.parse(readFileSync(resolve(rawRoot, name), 'utf8'));
const contentRoot = resolve('content');
const classIndexes = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin',
  'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
];
const rawClasses = Object.fromEntries(classIndexes.map(index => [index, read(`class-${index}.json`)]));
const rawSpells = read('spells-xge.json').spell.filter(spell => spell.source === 'XGE');
const rawSpellSources = read('spell-sources.json');
const rawFeats = read('feats.json').feat.filter(feat => feat.source === 'XGE');
const rawItems = read('items.json').item.filter(item => item.source === 'XGE');
const authoredSubclassFeatures = JSON.parse(
  readFileSync(resolve('scripts', 'xge-subclass-features.json'), 'utf8'),
);

const slug = (value) => value.toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const title = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const source = (page) => ({
  code: 'XGE', book: "Xanathar's Guide to Everything", edition: 2017, page,
  srd_5_2_1: false, rules_text: 'reference-only',
});
const write = (kind, index, value) => {
  const directory = resolve(contentRoot, kind);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${index}.json`), `${JSON.stringify(value, null, 2)}\n`);
};
const assertCount = (label, actual, expected) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
};

assertCount('XGE spells', rawSpells.length, 95);
assertCount('XGE feats', rawFeats.length, 15);
assertCount('XGE magic items', rawItems.length, 43);

const existingSpellIndexes = new Set(readdirSync(resolve(contentRoot, 'spells'))
  .filter(file => file.endsWith('.json'))
  .filter(file => JSON.parse(readFileSync(resolve(contentRoot, 'spells', file), 'utf8')).source?.code !== 'XGE')
  .map(file => file.replace(/\.json$/, '')));
const spellReprints = rawSpells.filter(spell => existingSpellIndexes.has(slug(spell.name)));
const importedSpells = rawSpells.filter(spell => !existingSpellIndexes.has(slug(spell.name)));
assertCount('XGE spell reprints already supplied by PHB 2024', spellReprints.length, 10);
assertCount('new XGE spells', importedSpells.length, 85);

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
const spellSummary = (spell) => {
  const school = schoolNames[spell.school].toLowerCase();
  const article = /^[aeiou]/.test(school) ? 'An' : 'A';
  const parts = [`${article} ${school} ${spell.level === 0 ? 'cantrip' : `level ${spell.level} spell`}.`];
  const attacks = (spell.spellAttack ?? []).map(value => attackNames[value] ?? value.toLowerCase());
  if (attacks.length) parts.push(`Uses a ${attacks.join(' or ')} spell attack.`);
  if (spell.savingThrow?.length) parts.push(`Calls for a ${spell.savingThrow.map(title).join(' or ')} saving throw.`);
  const damage = [...new Set(tagValues(spell.entries, 'damage'))];
  if (damage.length && spell.damageInflict?.length) {
    parts.push(`Can deal ${damage.join(' or ')} ${spell.damageInflict.join('/')} damage.`);
  }
  const healing = [...new Set(tagValues(spell.entries, 'dice'))];
  if (healing.length && spell.miscTags?.includes('HL')) parts.push(`Can restore ${healing.join(' or ')} Hit Points.`);
  if (spell.conditionInflict?.length) parts.push(`Can impose ${spell.conditionInflict.join(', ')}.`);
  parts.push(`See Xanathar's Guide to Everything, page ${spell.page}, for targeting and complete rules.`);
  return parts.join(' ');
};
const scalingText = (spell) => {
  const increments = [...new Set([
    ...scaledIncrement(spell.entriesHigherLevel),
    ...(spell.damageInflict?.length ? tagValues(spell.entriesHigherLevel, 'damage') : []),
  ])];
  if (increments.length) {
    const effect = spell.damageInflict?.length
      ? 'damage'
      : spell.miscTags?.includes('HL') ? 'healing' : 'effect';
    return `The ${effect} increases by ${increments.join(' or ')} for each spell slot level above ${spell.level}.`;
  }
  return spell.entriesHigherLevel
    ? `The spell improves with higher-level slots as described on XGE page ${spell.page}.`
    : undefined;
};

for (const spell of importedSpells) {
  const components = Object.entries(spell.components ?? {})
    .filter(([, present]) => Boolean(present))
    .map(([component]) => component.toUpperCase());
  const material = typeof spell.components?.m === 'string'
    ? spell.components.m
    : spell.components?.m?.text;
  const scale = scalingText(spell);
  write('spells', slug(spell.name), {
    index: slug(spell.name), name: spell.name, level: spell.level,
    school: schoolNames[spell.school], casting_time: formatCastingTime(spell.time),
    range: formatRange(spell.range), components, ...(material ? { material } : {}),
    duration: formatDuration(spell.duration), ritual: spell.meta?.ritual === true,
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
    description: spellSummary(spell),
    ...(spell.level === 0 && scale ? { cantrip_upgrade: scale } : {}),
    ...(spell.level > 0 && scale ? { higher_levels: scale } : {}),
    source: source(spell.page),
  });
}

const spellListAdditions = {};
const spellClassVariants = (spellName) => {
  const authoredRows = rawSpellSources.XGE?.[spellName]?.classVariant;
  if (Array.isArray(authoredRows)) return authoredRows;

  const generatedGroups = rawSpellSources.xge?.[spellName.toLowerCase()]?.classVariant ?? {};
  return Object.values(generatedGroups).flatMap(group =>
    Object.keys(group).map(name => ({ name })),
  );
};
for (const spell of importedSpells) {
  const classes = spellClassVariants(spell.name);
  for (const entry of classes) {
    const classIndex = slug(entry.name);
    (spellListAdditions[classIndex] ??= []).push(slug(spell.name));
  }
}
for (const spells of Object.values(spellListAdditions)) spells.sort();

const featDefinitions = {
  'bountiful-luck': {
    description: 'Use your reaction when a nearby ally rolls a 1 on a d20 test to let that ally reroll it.',
    species: ['halfling'],
    grants: [{ type: 'feature', key: 'bountiful-luck', name: 'Bountiful Luck', description: 'Reaction: let an ally within 30 feet reroll a natural 1; you cannot use your own Luck before your next turn.', action: { activation: 'reaction' } }],
  },
  'dragon-fear': {
    description: 'Replace a Breath Weapon use with a frightening roar that affects chosen creatures nearby.',
    species: ['dragonborn'], abilities: ['strength', 'constitution', 'charisma'],
    grants: [{ type: 'feature', name: 'Dragon Fear', description: 'Expend Breath Weapon to force chosen creatures within 30 feet to save against being Frightened.' }],
  },
  'dragon-hide': {
    description: 'Your draconic scales harden and your retractable claws become natural weapons.',
    species: ['dragonborn'], abilities: ['strength', 'constitution', 'charisma'],
    grants: [{ type: 'feature', name: 'Dragon Hide', description: 'While unarmored, your scales provide a natural AC formula; your claws deal 1d4 slashing damage.' }],
  },
  'drow-high-magic': {
    description: 'Learn additional drow magic, including at-will detection and two leveled spells.',
    species: ['elf'],
    speciesChoices: { elven_lineage: ['Drow'] },
    grants: [
      { type: 'spell_grant', key: 'drow_high_magic_detect', name: 'Drow High Magic', destination: 'known', spells: ['detect-magic'], countsAgainstLimit: false, sourceKey: 'drow-high-magic', sourceName: 'Drow High Magic', ability: 'charisma', freeCast: { atWill: true } },
      { type: 'spell_grant', key: 'drow_high_magic_spells', name: 'Drow High Magic', destination: 'known', spells: ['levitate', 'dispel-magic'], countsAgainstLimit: false, sourceKey: 'drow-high-magic', sourceName: 'Drow High Magic', ability: 'charisma', freeCast: { uses: 1, recovery: 'long_rest' } },
    ],
  },
  'dwarven-fortitude': {
    description: 'When you Dodge, you can spend one Hit Die to recover Hit Points.',
    species: ['dwarf'], abilities: ['constitution'],
    grants: [{ type: 'feature', name: 'Dwarven Fortitude', description: 'After taking the Dodge action, spend a Hit Die, roll it, and heal using the normal Hit Die modifier.' }],
  },
  'elven-accuracy': {
    description: 'When attacking with advantage using Dexterity, Intelligence, Wisdom, or Charisma, reroll one die once.',
    species: ['elf'], abilities: ['dexterity', 'intelligence', 'wisdom', 'charisma'],
  },
  'fade-away': {
    description: 'Turn invisible briefly as a reaction after taking damage.',
    species: ['gnome'], abilities: ['dexterity', 'intelligence'],
    grants: [{ type: 'feature', key: 'fade-away', name: 'Fade Away', description: 'Reaction after taking damage: become Invisible until the end of your next turn or until you attack, deal damage, or cast a spell.', action: { activation: 'reaction', uses: { max: 1, per: 'short_rest' } } }],
  },
  'fey-teleportation': {
    description: 'Learn Sylvan and gain a short-rest use of Misty Step.',
    species: ['elf'], abilities: ['intelligence', 'charisma'],
    speciesChoices: { elven_lineage: ['High Elf'] },
    grants: [{ type: 'spell_grant', key: 'fey_teleportation', name: 'Fey Teleportation', destination: 'known', spells: ['misty-step'], countsAgainstLimit: false, sourceKey: 'fey-teleportation', sourceName: 'Fey Teleportation', ability: 'intelligence', freeCast: { uses: 1, recovery: 'short_rest' } }],
  },
  'flames-of-phlegethos': {
    description: 'Improve fire spell damage and surround yourself with retaliatory flames after casting fire magic.',
    species: ['tiefling'], abilities: ['intelligence', 'charisma'],
  },
  'infernal-constitution': {
    description: 'Gain resistance to cold and poison damage and advantage against being Poisoned.',
    species: ['tiefling'], abilities: ['constitution'],
  },
  'orcish-fury': {
    description: 'Add an extra weapon damage die once per rest and strike back after using your survival trait.',
    species: ['orc'], abilities: ['strength', 'constitution'],
  },
  prodigy: {
    description: 'Gain one skill, one tool, one language, and Expertise in a proficient skill.',
    species: ['human'],
    grants: [
      { type: 'skill_choice', key: 'prodigy_skill', name: 'Prodigy Skill', choose: 1 },
      { type: 'expertise_choice', key: 'prodigy_expertise', name: 'Prodigy Expertise', choose: 1 },
      { type: 'feature', name: 'Prodigy Tool and Language', description: 'Choose one tool proficiency and one language.' },
    ],
  },
  'second-chance': {
    description: 'Use your reaction to force an attacker who hits you to reroll the attack.',
    species: ['halfling'], abilities: ['dexterity', 'constitution', 'charisma'],
    grants: [{ type: 'feature', key: 'second-chance', name: 'Second Chance', description: 'Reaction when a creature hits you: force the attack roll to be rerolled.', action: { activation: 'reaction', uses: { max: 1, per: 'short_rest' } } }],
  },
  'squat-nimbleness': {
    description: 'Become faster and more adept at Athletics or Acrobatics, with an easier time escaping grapples.',
    species: ['dwarf', 'gnome', 'halfling'], abilities: ['strength', 'dexterity'],
    grants: [{ type: 'skill_choice', key: 'squat_nimbleness_skill', name: 'Squat Nimbleness Skill', choose: 1, skills: ['Athletics', 'Acrobatics'] }],
  },
  'wood-elf-magic': {
    description: 'Learn Druidcraft and gain one daily use each of Longstrider and Pass without Trace.',
    species: ['elf'],
    speciesChoices: { elven_lineage: ['Wood Elf'] },
    grants: [
      { type: 'spell_grant', key: 'wood_elf_magic_cantrip', name: 'Wood Elf Magic', destination: 'known', spells: ['druidcraft'], countsAgainstLimit: false, sourceKey: 'wood-elf-magic', sourceName: 'Wood Elf Magic', ability: 'wisdom' },
      { type: 'spell_grant', key: 'wood_elf_magic_spells', name: 'Wood Elf Magic', destination: 'known', spells: ['longstrider', 'pass-without-trace'], countsAgainstLimit: false, sourceKey: 'wood-elf-magic', sourceName: 'Wood Elf Magic', ability: 'wisdom', freeCast: { uses: 1, recovery: 'long_rest' } },
    ],
  },
};

for (const feat of rawFeats) {
  const index = slug(feat.name);
  const definition = featDefinitions[index];
  if (!definition) throw new Error(`Missing authored feat definition: ${feat.name}`);
  write('feats', index, {
    index, name: feat.name, description: definition.description,
    category: 'general', prerequisite: {
      level: 4, species: definition.species,
      ...(definition.speciesChoices ? { speciesChoices: definition.speciesChoices } : {}),
    },
    ...(definition.abilities ? { abilityIncrease: { abilities: definition.abilities, amount: 1 } } : {}),
    ...(definition.grants ? { grants: definition.grants } : {}),
    source: source(feat.page),
  });
}

const itemDescriptions = {
  'bead-of-nourishment': 'A consumable bead that provides one day of nourishment.',
  'bead-of-refreshment': 'A consumable bead that turns a small amount of ordinary liquid into fresh drinking water.',
  'boots-of-false-tracks': 'Boots that let a humanoid leave tracks resembling those of another kind of humanoid.',
  'candle-of-the-deep': 'A candle whose flame continues burning underwater.',
  'charlatans-die': 'An attuned six-sided die whose result you can control.',
  'cloak-of-billowing': 'A cloak that can billow dramatically on command.',
  'cloak-of-many-fashions': 'A cloak whose color, style, and apparent quality can be changed.',
  'clockwork-amulet': 'An amulet that can replace one attack roll with a fixed, reliable result once per day.',
  'clothes-of-mending': 'Clothing that magically repairs ordinary daily wear and damage.',
  'dark-shard-amulet': 'A Warlock focus that can temporarily provide an unknown Warlock cantrip after a successful check.',
  'dread-helm': 'A helmet that makes the wearer’s eyes glow red.',
  'ear-horn-of-hearing': 'An ear horn that suppresses the Deafened condition while held in place.',
  'enduring-spellbook': 'A spellbook protected against fire, water, and ordinary deterioration.',
  'ersatz-eye': 'An artificial eye that functions as a natural eye after attunement.',
  'hat-of-vermin': 'A charged hat that can produce a harmless bat, frog, or rat.',
  'hat-of-wizardry': 'A Wizard focus that can temporarily provide an unknown Wizard cantrip after a successful check.',
  'hewards-handy-spice-pouch': 'A charged pouch that produces pinches of selected mundane seasonings.',
  'horn-of-silent-alarm': 'A charged horn that silently alerts one creature within range.',
  'instrument-of-illusions': 'An instrument that creates harmless visual effects while it is played.',
  'instrument-of-scribing': 'A charged instrument that writes a short luminous message while played.',
  'lock-of-trickery': 'A magical lock that is harder to pick than an ordinary lock.',
  'mystery-key': 'A key with a small chance to open a lock into which it is inserted.',
  'orb-of-direction': 'An orb that identifies the direction of north.',
  'orb-of-time': 'An orb that identifies whether it is morning, afternoon, evening, or night.',
  'perfume-of-bewitching': 'A consumable perfume that briefly improves social influence over nearby humanoids.',
  'pipe-of-smoke-monsters': 'A pipe that shapes smoke into harmless miniature creatures.',
  'pole-of-angling': 'A pole that transforms into a functional fishing pole.',
  'pole-of-collapsing': 'A ten-foot pole that can collapse into a compact rod.',
  'pot-of-awakening': 'A pot that can eventually awaken an ordinary shrub planted in it.',
  'rope-of-mending': 'A cut rope that can magically repair itself.',
  'ruby-of-the-war-mage': 'An attuned ruby that turns a weapon into a spellcasting focus.',
  'shield-of-expression': 'A shield whose face can display a chosen facial expression.',
  'staff-of-adornment': 'A staff that can suspend small objects above it for display.',
  'staff-of-birdcalls': 'A charged staff that creates a variety of bird calls.',
  'staff-of-flowers': 'A charged staff that causes a harmless flower to grow from nearby earth.',
  'talking-doll': 'An attuned doll that speaks recorded phrases when specified conditions occur.',
  'tankard-of-sobriety': 'A tankard that prevents ordinary alcohol drunk from it from causing intoxication.',
  'unbreakable-arrow': 'An arrow that cannot be broken except while inside an antimagic effect.',
  'veterans-cane': 'A cane that can permanently transform into a longsword.',
  'wand-of-conducting': 'A charged wand that produces orchestral music while waved.',
  'wand-of-pyrotechnics': 'A charged wand that creates a harmless burst of light.',
  'wand-of-scowls': 'A charged wand that can force a humanoid’s expression into a scowl.',
  'wand-of-smiles': 'A charged wand that can force a humanoid’s expression into a smile.',
};

for (const item of rawItems) {
  const index = slug(item.name);
  const description = itemDescriptions[index];
  if (!description) throw new Error(`Missing authored item summary: ${item.name}`);
  write('items', index, {
    index, name: item.name, type: 'gear',
    category: item.wondrous ? 'Wondrous Item' : item.staff ? 'Staff' : 'Magic Item',
    damage: null, damage_type: null, properties: [], weight: item.weight ?? 0,
    cost: '—', description, rarity: item.rarity ?? 'common',
    ...(item.reqAttune ? { requires_attunement: item.reqAttune } : {}),
    ...(item.charges ? { charges: { max: item.charges, recovery: item.recharge === 'dawn' ? 'dawn' : 'long_rest' } } : {}),
    source: source(item.page),
  });
}

const subclassMilestones = {
  barbarian: [3, 6, 10, 14], bard: [3, 6, 14], cleric: [3, 6, 17],
  druid: [3, 6, 10, 14], fighter: [3, 7, 10, 15, 18], monk: [3, 6, 11, 17],
  paladin: [3, 7, 15, 20], ranger: [3, 7, 11, 15], rogue: [3, 9, 13, 17],
  sorcerer: [3, 6, 14, 18], warlock: [3, 6, 10, 14], wizard: [3, 6, 10, 14],
};
const subclassReprints = new Set(['barbarian:zealot', 'bard:glamour', 'ranger:gloom-stalker', 'warlock:celestial']);
const legacySpellAliases = { 'branding-smite': 'shining-smite' };
const nearestMilestone = (classIndex, level) => [...subclassMilestones[classIndex]]
  .sort((left, right) => Math.abs(left - level) - Math.abs(right - level) || left - right)[0];
const spellIndex = (reference) => {
  const index = slug(reference.split('|')[0].replace(/#c$/, ''));
  return legacySpellAliases[index] ?? index;
};
const collectSpellReferences = (value) => {
  if (typeof value === 'string') return [spellIndex(value)];
  if (Array.isArray(value)) return value.flatMap(collectSpellReferences);
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(collectSpellReferences);
};
const additionalSpellGrants = (classIndex, subclass) => {
  if (classIndex === 'sorcerer' && subclass.shortName === 'Divine Soul') {
    const options = subclass.additionalSpells.map(entry => {
      const spell = collectSpellReferences(entry.known)[0];
      return {
        name: entry.name,
        grants: [{ type: 'spell_grant', key: `divine_soul_${slug(entry.name)}`, name: `${entry.name} Affinity`, destination: 'known', spells: [spell], countsAgainstLimit: false }],
      };
    });
    return [
      { type: 'spell_list_expansion', key: 'divine_soul_cleric_spells', name: 'Divine Magic', list: 'Cleric', description: 'Cleric spells are eligible as Sorcerer spell choices.' },
      { type: 'choice', key: 'divine_soul_affinity', name: 'Divine Affinity', choose: 1, options },
    ];
  }
  if (classIndex === 'fighter' && subclass.shortName === 'Arcane Archer') {
    return [{
      type: 'choice', key: 'arcane_archer_cantrip', name: 'Arcane Archer Cantrip', choose: 1,
      options: [
        { name: 'Prestidigitation', grants: [{ type: 'spell_grant', key: 'arcane_archer_prestidigitation', name: 'Arcane Archer Lore', destination: 'known', spells: ['prestidigitation'], countsAgainstLimit: false, ability: 'intelligence' }] },
        { name: 'Druidcraft', grants: [{ type: 'spell_grant', key: 'arcane_archer_druidcraft', name: 'Arcane Archer Lore', destination: 'known', spells: ['druidcraft'], countsAgainstLimit: false, ability: 'intelligence' }] },
      ],
    }];
  }
  const grouped = new Map();
  for (const block of subclass.additionalSpells ?? []) {
    for (const destination of ['prepared', 'known', 'innate', 'expanded']) {
      const rows = block[destination];
      if (!rows) continue;
      for (const [rawLevel, value] of Object.entries(rows)) {
        const spellLevel = Number(rawLevel.replace(/^s/, ''));
        const threshold = rawLevel.startsWith('s')
          ? Math.max(3, spellLevel * 2 - 1)
          : Math.max(3, Number.isFinite(spellLevel) ? spellLevel : 3);
        const target = destination === 'prepared' || destination === 'expanded' ? 'always_prepared' : 'known';
        const key = `${target}:${threshold}`;
        const current = grouped.get(key) ?? { destination: target, threshold, spells: [] };
        current.spells.push(...collectSpellReferences(value));
        grouped.set(key, current);
      }
    }
  }
  return [...grouped.values()].map(group => ({
    type: 'spell_grant', key: `${slug(subclass.shortName)}_spells_${group.threshold}`,
    name: `${subclass.shortName} Spells`, destination: group.destination,
    spells: [...new Set(group.spells)], countsAgainstLimit: false, classLevel: group.threshold,
  }));
};

const importedSubclasses = [];
const reprintedSubclasses = [];
const usedSubclassFeatureKeys = new Set();
for (const classIndex of classIndexes) {
  const data = rawClasses[classIndex];
  for (const subclass of data.subclass.filter(entry => entry.source === 'XGE')) {
    const index = subclass.shortName === 'War' ? 'war-magic' : slug(subclass.shortName);
    if (subclassReprints.has(`${classIndex}:${index}`)) {
      reprintedSubclasses.push({ class_index: classIndex, index, name: subclass.name });
      continue;
    }
    const features = data.subclassFeature.filter(feature =>
      feature.source === 'XGE' && feature.subclassShortName === subclass.shortName);
    const levelMap = new Map(subclassMilestones[classIndex].map(level => [level, []]));
    for (const entry of features) {
      if (entry.name === subclass.name || entry.name === subclass.shortName) continue;
      const featureKey = `${classIndex}:${index}:${entry.level}:${slug(entry.name)}`;
      const authored = authoredSubclassFeatures[featureKey];
      if (!authored) throw new Error(`Missing authored subclass feature: ${featureKey}`);
      usedSubclassFeatureKeys.add(featureKey);
      const targetLevel = nearestMilestone(classIndex, entry.level);
      const grants = levelMap.get(targetLevel);
      if (!grants.some(grant => grant.name === entry.name)) {
        grants.push({
          type: 'feature', name: entry.name, ...authored,
          ...(authored.action ? { key: `xge_${classIndex}_${index}_${entry.level}_${slug(entry.name)}` } : {}),
        });
      }
    }
    const spellGrants = additionalSpellGrants(classIndex, subclass);
    levelMap.get(subclassMilestones[classIndex][0]).unshift(...spellGrants);
    for (const [level, grants] of levelMap) {
      levelMap.set(level, grants.filter((grant, position, all) =>
        grant.type !== 'feature'
        || !all.some((candidate, candidatePosition) =>
          candidatePosition !== position && candidate.type !== 'feature' && candidate.name === grant.name),
      ));
    }
    const levels = [...levelMap.entries()].map(([level, grants]) => ({
      level, features: [...new Set(grants.map(grant => grant.name))], ...(grants.length ? { grants } : {}),
    }));
    const output = {
      class_index: classIndex, index, name: subclass.name,
      description: `A legacy ${classIndex} subclass from Xanathar's Guide to Everything.`,
      levels, source: source(subclass.page),
    };
    importedSubclasses.push(output);
    write('subclasses', `${classIndex}-${index}`, output);
  }
}
const unusedSubclassFeatureKeys = Object.keys(authoredSubclassFeatures)
  .filter(key => !usedSubclassFeatureKeys.has(key));
if (unusedSubclassFeatureKeys.length) {
  throw new Error(`Unused authored subclass features: ${unusedSubclassFeatureKeys.join(', ')}`);
}
assertCount('published XGE subclasses', importedSubclasses.length + reprintedSubclasses.length, 31);
assertCount('new XGE subclasses', importedSubclasses.length, 27);
assertCount('XGE subclass reprints already supplied by PHB 2024', reprintedSubclasses.length, 4);

const catalog = (entries) => entries.map(entry => ({ index: slug(entry.name), name: entry.name }));
write('manifests', 'xanathars-guide-to-everything', {
  source: { code: 'XGE', name: "Xanathar's Guide to Everything", edition: 2017, rules_text: 'reference-only' },
  compatibility: {
    rules_origin: '2014 legacy content', host_rules: '2024 core classes',
    subclass_levels: 'Legacy subclass features are grouped into the nearest 2024 subclass milestone.',
    spell_aliases: legacySpellAliases,
  },
  counts: {
    published_subclasses: 31, imported_subclasses: 27, phb_2024_subclass_reprints: 4,
    published_spells: 95, imported_spells: 85, phb_2024_spell_reprints: 10,
    feats: 15, magic_items: 43,
  },
  catalog: {
    subclasses: importedSubclasses.map(entry => ({ class_index: entry.class_index, index: entry.index, name: entry.name })),
    feats: catalog(rawFeats), magic_items: catalog(rawItems), spells: catalog(importedSpells),
  },
  supplied_by_phb_2024: {
    subclasses: reprintedSubclasses,
    spells: catalog(spellReprints),
  },
  spell_list_additions: spellListAdditions,
  implementation: {
    structured: ['source gating', 'subclass selection', 'subclass feature mechanics and actions', 'subclass spell grants', 'racial feat prerequisites', 'feat spell grants', 'class spell-list membership', 'spell metadata', 'magic-item catalog metadata'],
    descriptive_reference: ['bespoke spell effects', 'common magic-item activation details'],
  },
  non_catalog_book_systems: [
    'tool proficiency guidance', 'spellcasting edge-case guidance', 'encounter building guidance',
    'random encounter tables', 'trap design', 'downtime activities', 'magic-item distribution guidance',
    'shared campaigns', 'character-name tables',
  ],
});

console.log(`Imported ${importedSubclasses.length} subclasses, ${importedSpells.length} spells, ${rawFeats.length} feats, and ${rawItems.length} magic items.`);
