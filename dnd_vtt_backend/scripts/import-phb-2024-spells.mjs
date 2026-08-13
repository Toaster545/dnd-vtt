import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const SCHOOL_NAMES = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  V: 'Evocation',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
};

// Eberron: Forge of the Artificer adds this class access to PHB spells. Keep
// it here so regenerating the PHB records does not discard that access.
const ARTIFICER_PHB_SPELLS = new Set([
  'acid-splash',
  'aid',
  'alarm',
  'alter-self',
  'animate-objects',
  'arcane-eye',
  'arcane-lock',
  'arcane-vigor',
  'bigbys-hand',
  'blink',
  'blur',
  'circle-of-power',
  'continual-flame',
  'create-food-and-water',
  'creation',
  'cure-wounds',
  'dancing-lights',
  'darkvision',
  'detect-magic',
  'disguise-self',
  'dispel-magic',
  'dragons-breath',
  'elemental-weapon',
  'elementalism',
  'enhance-ability',
  'enlarge-reduce',
  'expeditious-retreat',
  'fabricate',
  'faerie-fire',
  'false-life',
  'feather-fall',
  'fire-bolt',
  'fly',
  'freedom-of-movement',
  'glyph-of-warding',
  'grease',
  'greater-restoration',
  'guidance',
  'haste',
  'heat-metal',
  'identify',
  'invisibility',
  'jump',
  'leomunds-secret-chest',
  'lesser-restoration',
  'levitate',
  'light',
  'longstrider',
  'mage-hand',
  'magic-mouth',
  'magic-weapon',
  'message',
  'mordenkainens-faithful-hound',
  'mordenkainens-private-sanctum',
  'otilukes-resilient-sphere',
  'poison-spray',
  'prestidigitation',
  'protection-from-energy',
  'protection-from-poison',
  'purify-food-and-drink',
  'ray-of-frost',
  'resistance',
  'revivify',
  'rope-trick',
  'sanctuary',
  'see-invisibility',
  'shocking-grasp',
  'spare-the-dying',
  'spider-climb',
  'stone-shape',
  'stoneskin',
  'summon-construct',
  'thorn-whip',
  'thunderclap',
  'true-strike',
  'wall-of-stone',
  'water-breathing',
  'water-walk',
  'web',
]);

const SUPPLEMENTAL_SPELL_FILES = new Set(['homunculus-servant.json']);

function usage() {
  console.error(
    'Usage: node scripts/import-phb-2024-spells.mjs <spells-xphb.json> <srd-5.2-spells.json> <spell-source-lookup.json>',
  );
  process.exit(1);
}

const [, , phbPath, srdPath, lookupPath] = process.argv;
if (!phbPath || !srdPath || !lookupPath) usage();

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function cleanTags(value) {
  if (!value) return '';
  return String(value)
    .replace(
      /\{@(?:damage|dice|scaledice|scaledamage) ([^}|]+)(?:\|[^}]*)?}/g,
      '$1',
    )
    .replace(
      /\{@(?:spell|item|condition|variantrule|action|skill|sense|status|creature|feat|classFeature|filter) ([^}|]+)(?:\|[^}]*)?}/g,
      '$1',
    )
    .replace(/\{@(?:b|i) ([^}]+)}/g, '$1')
    .replace(/\{@[^ ]+ ([^}|]+)(?:\|[^}]*)?}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function plural(number, unit) {
  const labels = {
    action: 'action',
    bonus: 'bonus action',
    reaction: 'reaction',
    minute: 'minute',
    hour: 'hour',
  };
  const label = labels[unit] ?? unit;
  return `${number} ${label}${number === 1 ? '' : 's'}`;
}

function formatCastingTime(times) {
  return (times ?? [])
    .map((time) => {
      const base = plural(time.number ?? 1, time.unit);
      return time.condition ? `${base}, ${cleanTags(time.condition)}` : base;
    })
    .join(' or ');
}

function formatDistance(distance) {
  if (!distance) return '';
  const named = {
    self: 'Self',
    touch: 'Touch',
    sight: 'Sight',
    unlimited: 'Unlimited',
  };
  if (named[distance.type]) return named[distance.type];
  const amount = distance.amount ?? '';
  const unit = distance.type === 'feet' ? 'feet' : distance.type;
  return `${amount} ${unit}`.trim();
}

function formatRange(range) {
  if (!range) return '';
  const distance = formatDistance(range.distance);
  if (range.type === 'point') return distance;
  const shape = range.type.charAt(0).toUpperCase() + range.type.slice(1);
  if (range.distance?.type === 'self') return `Self (${shape})`;
  return `${distance} (${shape})`.trim();
}

function formatDurationPart(duration) {
  if (duration.type === 'instant') return 'Instantaneous';
  if (duration.type === 'special') return 'Special';
  if (duration.type === 'permanent') {
    const endingLabels = { dispel: 'dispelled', trigger: 'triggered' };
    const endings = (duration.ends ?? []).map(
      (ending) => endingLabels[ending] ?? ending,
    );
    return endings.length ? `Until ${endings.join(' or ')}` : 'Permanent';
  }
  if (duration.type === 'timed') {
    const amount = duration.duration?.amount ?? 1;
    const rawUnit = duration.duration?.type ?? '';
    const unit = `${rawUnit}${amount === 1 ? '' : 's'}`;
    const prefix = duration.concentration ? 'Concentration, up to ' : '';
    return `${prefix}${amount} ${unit}`;
  }
  return duration.type ?? '';
}

function formatDuration(durations) {
  return (durations ?? []).map(formatDurationPart).join(' or ');
}

function materialText(material) {
  if (!material) return undefined;
  return cleanTags(typeof material === 'string' ? material : material.text);
}

function spellMechanics(spell) {
  const attackType = { M: 'melee', R: 'ranged' };
  const scaling = spell.scalingLevelDice
    ? {
        label: cleanTags(spell.scalingLevelDice.label),
        values: spell.scalingLevelDice.scaling,
      }
    : undefined;

  return {
    ...(spell.spellAttack?.length
      ? {
          spell_attacks: uniqueSorted(
            spell.spellAttack.map((type) => attackType[type] ?? type),
          ),
        }
      : {}),
    saving_throws: uniqueSorted(spell.savingThrow ?? []),
    ability_checks: uniqueSorted(spell.abilityCheck ?? []),
    damage_types: uniqueSorted(spell.damageInflict ?? []),
    conditions: uniqueSorted(spell.conditionInflict ?? []),
    affects_creature_types: uniqueSorted(spell.affectsCreatureType ?? []),
    grants_damage_immunities: uniqueSorted(spell.damageImmune ?? []),
    grants_damage_resistances: uniqueSorted(spell.damageResist ?? []),
    grants_damage_vulnerabilities: uniqueSorted(spell.damageVulnerable ?? []),
    grants_condition_immunities: uniqueSorted(spell.conditionImmune ?? []),
    area_tags: uniqueSorted(spell.areaTags ?? []),
    misc_tags: uniqueSorted(spell.miscTags ?? []),
    ...(scaling ? { scaling } : {}),
  };
}

function componentList(components) {
  return ['v', 's', 'm']
    .filter((key) => components?.[key])
    .map((key) => key.toUpperCase());
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function phbAccessMetadata(sourceLookup = {}) {
  const classes = Object.keys(sourceLookup.class?.XPHB ?? {});

  const subclasses = [];
  for (const [className, classSources] of Object.entries(
    sourceLookup.subclass?.XPHB ?? {},
  )) {
    for (const [classSource, subclassEntries] of Object.entries(classSources)) {
      if (classSource !== 'XPHB') continue;
      for (const [subclassName, details] of Object.entries(subclassEntries)) {
        const variants = details?.subSubclasses?.length
          ? details.subSubclasses
          : [undefined];
        for (const variant of variants) {
          subclasses.push({
            class: className,
            subclass: details?.name ?? subclassName,
            ...(variant ? { variant } : {}),
          });
        }
      }
    }
  }

  return {
    classes: uniqueSorted(classes),
    subclasses: subclasses.sort((a, b) =>
      `${a.class}:${a.subclass}:${a.variant ?? ''}`.localeCompare(
        `${b.class}:${b.subclass}:${b.variant ?? ''}`,
      ),
    ),
    species: uniqueSorted(Object.keys(sourceLookup.race?.XPHB ?? {})),
    backgrounds: uniqueSorted(Object.keys(sourceLookup.background?.XPHB ?? {})),
    feats: uniqueSorted(Object.keys(sourceLookup.feat?.XPHB ?? {})),
    other_options: uniqueSorted(
      Object.keys(sourceLookup.optionalfeature?.XPHB ?? {}),
    ),
  };
}

function resolveSrdSpell(phbSpell, srdByName) {
  if (!phbSpell.srd52) return null;
  const srdName =
    typeof phbSpell.srd52 === 'string' ? phbSpell.srd52 : phbSpell.name;
  const spell = srdByName.get(srdName.toLowerCase());
  if (!spell)
    throw new Error(
      `No SRD 5.2.1 record found for ${phbSpell.name} (${srdName})`,
    );
  return { spell, srdName };
}

const phbDocument = loadJson(phbPath);
const srdSpells = loadJson(srdPath);
const sourceLookup = loadJson(lookupPath);
const referenceOnlySummaries = loadJson(
  resolve('scripts', 'reference-only-spell-summaries.json'),
);
const phbSpells = phbDocument.spell ?? [];
const srdByName = new Map(
  srdSpells.map((spell) => [spell.name.toLowerCase(), spell]),
);

if (phbSpells.length !== 391) {
  throw new Error(`Expected 391 PHB'24 spells, found ${phbSpells.length}`);
}

const outputDir = resolve('content', 'spells');
const manifestDir = resolve('content', 'manifests');
mkdirSync(outputDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

const generated = [];
for (const phbSpell of phbSpells) {
  const index = slugify(phbSpell.name);
  const lookup = sourceLookup.xphb?.[phbSpell.name.toLowerCase()] ?? {};
  const access = phbAccessMetadata(lookup);
  if (ARTIFICER_PHB_SPELLS.has(index)) {
    access.classes = uniqueSorted([...access.classes, 'Artificer']);
  }
  const srdMatch = resolveSrdSpell(phbSpell, srdByName);
  const rulesTextAvailable = Boolean(srdMatch);
  const description = rulesTextAvailable
    ? srdMatch.spell.description
    : referenceOnlySummaries[index];
  if (!description) {
    throw new Error(
      `Missing reference-only rules summary for ${phbSpell.name} (${index})`,
    );
  }

  const record = {
    index,
    name: phbSpell.name,
    level: phbSpell.level,
    school: SCHOOL_NAMES[phbSpell.school],
    casting_time: formatCastingTime(phbSpell.time),
    range: formatRange(phbSpell.range),
    components: componentList(phbSpell.components),
    ...(materialText(phbSpell.components?.m)
      ? { material: materialText(phbSpell.components.m) }
      : {}),
    ...(typeof phbSpell.components?.m === 'object' && phbSpell.components.m.cost
      ? { material_cost_cp: phbSpell.components.m.cost }
      : {}),
    ...(typeof phbSpell.components?.m === 'object' &&
    phbSpell.components.m.consume
      ? { material_consumed: true }
      : {}),
    duration: formatDuration(phbSpell.duration),
    ritual: Boolean(phbSpell.meta?.ritual),
    concentration: Boolean(
      phbSpell.duration?.some((duration) => duration.concentration),
    ),
    classes: access.classes,
    subclasses: access.subclasses,
    species: access.species,
    backgrounds: access.backgrounds,
    feats: access.feats,
    other_options: access.other_options,
    mechanics: spellMechanics(phbSpell),
    description,
    ...(srdMatch?.spell.higherLevelSlot
      ? { higher_levels: srdMatch.spell.higherLevelSlot }
      : {}),
    ...(srdMatch?.spell.cantripUpgrade
      ? { cantrip_upgrade: srdMatch.spell.cantripUpgrade }
      : {}),
    source: {
      book: "Player's Handbook",
      edition: 2024,
      code: 'XPHB',
      page: phbSpell.page,
      srd_5_2_1: rulesTextAvailable,
      ...(srdMatch && srdMatch.srdName !== phbSpell.name
        ? { srd_name: srdMatch.srdName }
        : {}),
      rules_text: rulesTextAvailable ? 'SRD 5.2.1' : 'reference-only',
    },
  };

  if (!record.school)
    throw new Error(
      `Unknown school code ${phbSpell.school} for ${phbSpell.name}`,
    );
  generated.push(record);
  writeFileSync(
    join(outputDir, `${index}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
}

const duplicateIndexes = generated
  .map((spell) => spell.index)
  .filter((index, position, all) => all.indexOf(index) !== position);
if (duplicateIndexes.length)
  throw new Error(
    `Duplicate indexes: ${uniqueSorted(duplicateIndexes).join(', ')}`,
  );

const generatedNames = new Set(generated.map((spell) => `${spell.index}.json`));
const staleFiles = readdirSync(outputDir)
  .filter(
    (file) =>
      file.endsWith('.json') &&
      !generatedNames.has(file) &&
      !SUPPLEMENTAL_SPELL_FILES.has(file),
  )
  .map((file) => basename(file));
if (staleFiles.length) {
  throw new Error(
    `Unexpected spell JSON files remain: ${staleFiles.join(', ')}`,
  );
}

const manifest = {
  source: "Player's Handbook (2024)",
  source_code: 'XPHB',
  total: generated.length,
  srd_5_2_1_rules_text: generated.filter((spell) => spell.source.srd_5_2_1)
    .length,
  reference_only: generated.filter((spell) => !spell.source.srd_5_2_1).length,
  spells: generated.map((spell) => ({
    index: spell.index,
    name: spell.name,
    level: spell.level,
  })),
};
writeFileSync(
  join(manifestDir, 'phb-2024-spells.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(
  `Generated ${manifest.total} PHB'24 spell records (${manifest.srd_5_2_1_rules_text} with SRD rules text, ${manifest.reference_only} reference-only).`,
);
