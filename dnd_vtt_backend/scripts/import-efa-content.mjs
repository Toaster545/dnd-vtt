import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [racesFile, backgroundsFile, featsFile, itemsFile, variantsFile, bestiaryFile] = process.argv.slice(2);
if (![racesFile, backgroundsFile, featsFile, itemsFile, variantsFile, bestiaryFile].every(Boolean)) {
  throw new Error('Usage: node scripts/import-efa-content.mjs <races.json> <backgrounds.json> <feats.json> <items.json> <magicvariants.json> <bestiary-efa.json>');
}

const read = (file) => JSON.parse(readFileSync(resolve(file), 'utf8'));
const raw = {
  races: read(racesFile), backgrounds: read(backgroundsFile), feats: read(featsFile),
  items: read(itemsFile), variants: read(variantsFile), bestiary: read(bestiaryFile),
};
const contentRoot = resolve('content');
const source = (page) => ({
  code: 'EFA', book: 'Eberron: Forge of the Artificer', edition: 2024, page,
  srd_5_2_1: false, rules_text: 'reference-only',
});
const slug = (value) => value.toLowerCase()
  .replace(/[’']/g, '').replace(/\+([12])/g, '-plus-$1')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const title = (value) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());
const write = (kind, index, value) => {
  const directory = resolve(contentRoot, kind);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${index}.json`), `${JSON.stringify(value, null, 2)}\n`);
};

const feature = (name, description, extra = {}) => ({ type: 'feature', name, description, ...extra });
const skillChoice = (key, name, choose, skills) => ({ type: 'skill_choice', key, name, choose, skills });
const choice = (key, name, options, description) => ({
  type: 'choice', key, name, choose: 1, description,
  options: options.map((option) => typeof option === 'string' ? { name: option } : option),
});

const races = [
  {
    index: 'changeling', name: 'Changeling', creature_type: 'Fey', speed: 30, size: 'Medium',
    size_options: ['Small', 'Medium'], darkvision_ft: undefined,
    description: 'Fey shape-shifters who can alter their appearance and voice.',
    traits: ['Changeling Instincts', 'Shape-Shifter'], languages: [], subraces: [], source: source(34),
    grants: [
      skillChoice('changeling_instincts', 'Changeling Instincts', 2, ['Deception', 'Insight', 'Intimidation', 'Performance', 'Persuasion']),
      feature('Shape-Shifter', 'As an action, alter your appearance, voice, height, weight, and Small or Medium size without changing game statistics. While transformed this way, you have Advantage on Charisma checks.'),
    ],
  },
  {
    index: 'kalashtar', name: 'Kalashtar', creature_type: 'Aberration', speed: 30, size: 'Medium',
    description: 'People joined to dream spirits, possessing disciplined and telepathic minds.',
    traits: ['Dual Mind', 'Mental Discipline', 'Mind Link', 'Severed from Dreams'], languages: [], subraces: [], source: source(35),
    grants: [
      feature('Dual Mind', 'You have Advantage on Wisdom and Charisma saving throws.'),
      feature('Mental Discipline', 'You have Resistance to Psychic damage.'),
      feature('Mind Link', 'You have telepathy out to 10 times your character level in feet and can temporarily enable a contacted creature to reply.'),
      feature('Severed from Dreams', 'Dream cannot target you. After each Long Rest, choose one skill proficiency that lasts until your next Long Rest.'),
      skillChoice('severed_from_dreams_skill', 'Severed from Dreams Skill', 1),
    ],
  },
  {
    index: 'khoravar', name: 'Khoravar', creature_type: 'Humanoid', speed: 30, size: 'Medium',
    size_options: ['Small', 'Medium'], darkvision_ft: 60,
    description: 'A people with intertwined human and elven heritage and adaptable fey gifts.',
    traits: ['Darkvision', 'Fey Ancestry', 'Fey Gift', 'Lethargy Resilience', 'Skill Versatility'], languages: [], subraces: [], source: source(36),
    grants: [
      feature('Darkvision', 'You have Darkvision out to 60 feet.'),
      feature('Fey Ancestry', 'You have Advantage on saves to avoid or end the Charmed condition.'),
      choice('khoravar_spellcasting_ability', 'Fey Gift Spellcasting Ability', ['Intelligence', 'Wisdom', 'Charisma'], 'Choose the ability used by your Fey Gift cantrip.'),
      {
        type: 'spell_grant', key: 'khoravar_fey_gift', name: 'Fey Gift', destination: 'known', choose: 1,
        countsAgainstLimit: false, sourceKey: 'khoravar', sourceName: 'Khoravar',
        ability: { choiceKey: 'khoravar_spellcasting_ability' },
        filter: { lists: ['Cleric', 'Druid', 'Wizard'], exactLevels: [0] },
      },
      feature('Lethargy Resilience', 'When you fail a save against becoming Unconscious, you can succeed instead. The trait then requires multiple Long Rests before it can be used again.'),
      skillChoice('khoravar_skill_versatility', 'Skill Versatility', 1),
    ],
  },
  {
    index: 'shifter', name: 'Shifter', creature_type: 'Humanoid', speed: 30, size: 'Medium',
    size_options: ['Small', 'Medium'], darkvision_ft: 60,
    description: 'Humanoids with bestial aspects that emerge during a temporary shift.',
    traits: ['Bestial Instincts', 'Darkvision', 'Shifting'], languages: [], subraces: [], source: source(37),
    grants: [
      skillChoice('bestial_instincts', 'Bestial Instincts', 1, ['Acrobatics', 'Athletics', 'Intimidation', 'Survival']),
      feature('Darkvision', 'You have Darkvision out to 60 feet.'),
      {
        type: 'choice', key: 'shifting_form', name: 'Shifting Form', choose: 1,
        description: 'Choose the bestial benefit active while you are shifted.',
        options: [
          { name: 'Beasthide', description: 'Gain additional temporary Hit Points and +1 AC while shifted.' },
          { name: 'Longtooth', description: 'Gain a 1d6 Piercing unarmed strike usable as a Bonus Action while shifted.' },
          { name: 'Swiftstride', description: 'Gain 10 feet of Speed and a reactive movement while shifted.' },
          { name: 'Wildhunt', description: 'Gain Advantage on Wisdom checks and suppress nearby enemy Advantage against you.' },
        ],
      },
      feature('Shifting', 'As a Bonus Action, shift for 1 minute and gain temporary Hit Points equal to twice your Proficiency Bonus.', {
        key: 'shifter-shifting', action: { activation: 'bonus_action', uses: { max: 1, maxProficiencyBonus: true, per: 'long_rest' } },
      }),
    ],
  },
  {
    index: 'warforged', name: 'Warforged', creature_type: 'Construct', speed: 30, size: 'Medium',
    size_options: ['Small', 'Medium'],
    description: 'Living constructs built for war and now shaping lives of their own.',
    traits: ['Construct Resilience', 'Integrated Protection', "Sentry's Rest", 'Specialized Design', 'Tireless'], languages: [], subraces: [], source: source(38),
    grants: [
      feature('Construct Resilience', 'You resist Poison damage and have Advantage on saves to avoid or end the Poisoned condition.'),
      feature('Integrated Protection', 'You gain +1 AC, and donned armor cannot be removed from you against your will while you live.', { effects: [{ type: 'ac_bonus', value: 1 }] }),
      feature("Sentry's Rest", 'You need not sleep and magic cannot put you to sleep. You can complete a Long Rest while conscious and motionless.'),
      skillChoice('specialized_design_skill', 'Specialized Design: Skill', 1),
      choice('specialized_design_tool', 'Specialized Design: Tool', ["Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools", 'Disguise Kit', 'Forgery Kit', 'Herbalism Kit', "Navigator's Tools", "Thieves' Tools"], 'Choose one tool proficiency.'),
      feature('Tireless', 'You do not gain Exhaustion from dehydration, malnutrition, or suffocation.'),
    ],
  },
];
for (const race of races) write('races', race.index, race);

const itemIndexAliases = {
  'arrows (20)': 'arrows', 'map or scroll case': 'map-case', "traveler's clothes": 'travelers-clothes',
  "cartographer's tools": 'cartographers-tools', "navigator's tools": 'navigators-tools',
  "calligrapher's supplies": 'calligraphers-supplies', "cook's utensils": 'cooks-utensils',
  "healer's kit": 'healers-kit', "herbalism kit": 'herbalism-kit', "thieves' tools": 'thieves-tools',
  "bullseye lantern": 'bullseye-lantern', "climber's kit": 'climbers-kit', "hunting trap": 'hunting-trap',
  "musical instrument": 'musical-instrument', 'gaming set': 'gaming-set', 'fine clothes': 'fine-clothes',
  'iron pot': 'iron-pot', 'ink pen': 'ink-pen', 'disguise kit': 'disguise-kit',
};
const equipmentRef = (entry, position) => {
  if (typeof entry === 'object' && entry.equipmentType === 'toolArtisan') {
    return { key: `artisan-tools-${position}`, category: "Artisan's Tools", label: "Artisan's Tools" };
  }
  const rawItem = typeof entry === 'string' ? entry : entry.item;
  const name = rawItem.split('|')[0].toLowerCase();
  const index = itemIndexAliases[name] ?? slug(name.replace(/ \(\d+\)$/, ''));
  const embeddedQuantity = Number(name.match(/\((\d+)\)$/)?.[1] ?? 1);
  return { key: `${index}-${position}`, item: index, quantity: entry.quantity ?? embeddedQuantity };
};
const toolNames = {
  anyArtisansTool: "Artisan's Tools", anyGamingSet: 'Gaming Set', anyMusicalInstrument: 'Musical Instrument',
};
const backgroundRows = raw.backgrounds.background.filter((entry) => entry.source === 'EFA');
const officialFeatNames = new Map(raw.feats.feat
  .map((entry) => [entry.name.toLowerCase(), entry.name]));
for (const background of backgroundRows) {
  const packageA = background.startingEquipment?.[0]?.a ?? [];
  const fixed = packageA.filter((entry) => typeof entry !== 'object' || entry.value == null)
    .map(equipmentRef);
  const gold = packageA.find((entry) => typeof entry === 'object' && entry.value != null)?.value / 100 || 0;
  const featReference = Object.keys(background.feats?.[0] ?? {})[0] ?? '';
  const featKey = featReference.split('|')[0];
  const featName = officialFeatNames.get(featKey.toLowerCase()) ?? title(featKey);
  const skills = Object.keys(background.skillProficiencies?.[0] ?? {}).map(title);
  const tools = (background.toolProficiencies ?? []).flatMap((record) =>
    Object.keys(record).map((key) => toolNames[key] ?? title(key)));
  const abilities = background.ability?.[0]?.choose?.weighted?.from?.map((ability) => ({
    str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma',
  })[ability]) ?? [];
  write('backgrounds', slug(background.name), {
    index: slug(background.name), name: background.name,
    description: `An Eberron background from ${source(background.page).book}.`,
    skill_proficiencies: skills, tool_proficiencies: tools, languages: 'None',
    starting_equipment: { fixed, groups: [], gold, goldAlternative: 50 },
    feature: `Origin Feat: ${featName}`,
    grants: [{
      type: 'ability_choice', key: 'ability_scores', name: 'Ability Scores', points: 3, abilities,
      description: 'Increase one listed ability by 2 and another by 1, or increase all three by 1.',
    }],
    source: source(background.page),
  });
}

const coreSupportItems = [
  ['disguise-kit', 'Disguise Kit', 'Tool', 'A kit for creating disguises.'],
  ['cooks-utensils', "Cook's Utensils", "Artisan's Tools", 'Utensils used to prepare food.'],
  ['bullseye-lantern', 'Bullseye Lantern', 'Adventuring Gear', 'A lantern that focuses its light in a cone.'],
  ['map', 'Map', 'Adventuring Gear', 'A regional or local map.'],
  ['map-case', 'Map or Scroll Case', 'Adventuring Gear', 'A protective case for maps and scrolls.'],
  ['ink', 'Ink', 'Adventuring Gear', 'Writing ink in a small bottle.'],
  ['ink-pen', 'Ink Pen', 'Adventuring Gear', 'A pen suitable for ink.'],
  ['paper', 'Paper', 'Adventuring Gear', 'A sheet of writing paper.'],
  ['climbers-kit', "Climber's Kit", 'Adventuring Gear', 'Specialized equipment for safer climbing.'],
  ['hunting-trap', 'Hunting Trap', 'Adventuring Gear', 'A portable trap for restraining prey.'],
  ['net', 'Net', 'Adventuring Gear', 'A weighted net used to restrain a nearby creature.'],
];
for (const [index, name, category, description] of coreSupportItems) write('items', index, {
  index, name, type: 'gear', category, damage: null, damage_type: null,
  properties: [], weight: 0, cost: 'See PHB 2024', description,
  source: { code: 'XPHB', book: "Player's Handbook", edition: 2024, rules_text: 'reference-only' },
});

const markSpells = {
  detection: { page: 39, free: [['detect-magic', 1], ['see-invisibility', 3]], expanded: ['detect-evil-and-good', 'identify', 'detect-thoughts', 'find-traps', 'clairvoyance', 'nondetection', 'arcane-eye', 'divination', 'legend-lore'] },
  finding: { page: 39, free: [["hunters-mark", 1], ['locate-object', 3]], expanded: ['faerie-fire', 'longstrider', 'locate-animals-or-plants', 'mind-spike', 'clairvoyance', 'speak-with-plants', 'divination', 'locate-creature', 'commune-with-nature'] },
  handling: { page: 39, free: [['animal-friendship', 1], ['speak-with-animals', 1]], expanded: ['command', 'find-familiar', 'beast-sense', 'calm-emotions', 'beacon-of-hope', 'conjure-animals', 'aura-of-life', 'dominate-beast', 'awaken'] },
  healing: { page: 40, free: [['cure-wounds', 1], ['lesser-restoration', 3]], expanded: ['false-life', 'healing-word', 'arcane-vigor', 'prayer-of-healing', 'aura-of-vitality', 'mass-healing-word', 'aura-of-life', 'aura-of-purity', 'greater-restoration'] },
  hospitality: { page: 40, free: [['purify-food-and-drink', 1], ['unseen-servant', 1], ['calm-emotions', 3]], expanded: ['goodberry', 'sleep', 'aid', 'enhance-ability', 'create-food-and-water', 'leomunds-tiny-hut', 'aura-of-purity', 'mordenkainens-private-sanctum', 'hallow'] },
  making: { page: 40, cantrips: ['mending'], free: [['magic-weapon', 1]], expanded: ['identify', 'tensers-floating-disk', 'continual-flame', 'spiritual-weapon', 'conjure-barrage', 'elemental-weapon', 'fabricate', 'stone-shape', 'creation'] },
  passage: { page: 41, free: [['misty-step', 1]], expanded: ['expeditious-retreat', 'jump', 'find-steed', 'pass-without-trace', 'blink', 'phantom-steed', 'dimension-door', 'freedom-of-movement', 'teleportation-circle'] },
  scribing: { page: 41, cantrips: ['message'], free: [['comprehend-languages', 1], ['magic-mouth', 3]], expanded: ['command', 'illusory-script', 'animal-messenger', 'silence', 'sending', 'tongues', 'arcane-eye', 'confusion', 'dream'] },
  sentinel: { page: 41, free: [['shield', 1]], expanded: ['compelled-duel', 'shield-of-faith', 'warding-bond', 'zone-of-truth', 'counterspell', 'protection-from-energy', 'death-ward', 'guardian-of-faith', 'bigbys-hand'] },
  shadow: { page: 42, cantrips: ['minor-illusion'], free: [['invisibility', 1]], expanded: ['disguise-self', 'silent-image', 'darkness', 'pass-without-trace', 'clairvoyance', 'major-image', 'greater-invisibility', 'hallucinatory-terrain', 'mislead'] },
  storm: { page: 42, cantrips: ['thunderclap'], free: [['gust-of-wind', 3]], expanded: ['feather-fall', 'fog-cloud', 'levitate', 'shatter', 'sleet-storm', 'wind-wall', 'conjure-minor-elementals', 'control-water', 'conjure-elemental'] },
  warding: { page: 42, free: [['alarm', 1], ['mage-armor', 1], ['arcane-lock', 3]], expanded: ['armor-of-agathys', 'sanctuary', 'knock', 'nystuls-magic-aura', 'glyph-of-warding', 'magic-circle', 'leomunds-secret-chest', 'mordenkainens-faithful-hound', 'antilife-shell'] },
};
const abilityOptions = ['Intelligence', 'Wisdom', 'Charisma'];
for (const [mark, config] of Object.entries(markSpells)) {
  const display = `Mark of ${title(mark)}`;
  const index = slug(display);
  const grants = [
    feature(`${title(mark)} Intuition`, `Your dragonmark improves checks and special tasks associated with ${mark}.`),
    choice('dragonmark_spellcasting_ability', 'Dragonmark Spellcasting Ability', abilityOptions, 'Choose Intelligence, Wisdom, or Charisma for this mark.'),
    ...(config.cantrips?.length ? [{
      type: 'spell_grant', key: `${index}_cantrips`, name: display, destination: 'known', spells: config.cantrips,
      countsAgainstLimit: false, sourceKey: index, sourceName: display,
      ability: { choiceKey: 'dragonmark_spellcasting_ability' },
    }] : []),
    ...config.free.map(([spell, characterLevel]) => ({
      type: 'spell_grant', key: `${index}_${spell}`, name: display, destination: 'always_prepared', spells: [spell],
      countsAgainstLimit: false, sourceKey: index, sourceName: display, characterLevel,
      ability: { choiceKey: 'dragonmark_spellcasting_ability' }, freeCast: { uses: 1, recovery: 'long_rest' },
    })),
    {
      type: 'spell_list_expansion', key: `${index}_spells_of_the_mark`, name: 'Spells of the Mark',
      spells: config.expanded, alwaysPreparedIfFeat: 'potent-dragonmark', sourceKey: index, sourceName: display,
      ability: { choiceKey: 'dragonmark_spellcasting_ability' },
    },
  ];
  write('feats', index, {
    index, name: display, description: `Manifest the ${display}; gain its intuition, magic, and expanded spell list.`,
    category: 'origin', tags: ['dragonmark'], exclusiveGroup: 'dragonmark', grants, source: source(config.page),
  });
  const greaterIndex = `greater-${index}`;
  write('feats', greaterIndex, {
    index: greaterIndex, name: `Greater ${display}`,
    description: `Deepen the ${display}, improving its intuition and signature benefit.`,
    category: 'general', prerequisite: { level: 4, feats: [index] },
    abilityIncrease: { abilities: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'], amount: 1 },
    tags: ['dragonmark-upgrade'], source: source(config.page + (config.page < 40 ? 4 : 5)),
  });
}

write('feats', 'aberrant-dragonmark', {
  index: 'aberrant-dragonmark', name: 'Aberrant Dragonmark', category: 'origin',
  description: 'Manifest an unstable dragonmark that bolsters Constitution and channels unpredictable Sorcerer magic.',
  tags: ['dragonmark', 'aberrant-dragonmark'], exclusiveGroup: 'dragonmark', source: source(39),
  grants: [
    feature('Aberrant Fortitude', 'After failing a Constitution save, use your Reaction to add 1d4, potentially succeeding.', { key: 'aberrant-fortitude', action: { activation: 'reaction', uses: { max: 1, per: 'long_rest' } } }),
    { type: 'spell_grant', key: 'aberrant_cantrip', name: 'Aberrant Magic Cantrip', destination: 'known', choose: 1, countsAgainstLimit: false, list: 'Sorcerer', sourceKey: 'aberrant-dragonmark', sourceName: 'Aberrant Dragonmark', ability: 'constitution', filter: { exactLevels: [0] } },
    { type: 'spell_grant', key: 'aberrant_spell', name: 'Aberrant Magic Spell', destination: 'always_prepared', choose: 1, countsAgainstLimit: false, list: 'Sorcerer', sourceKey: 'aberrant-dragonmark', sourceName: 'Aberrant Dragonmark', ability: 'constitution', filter: { exactLevels: [1] }, freeCast: { uses: 1, recovery: 'short_rest' } },
    feature('Aberrant Surge', 'When casting the chosen spell, you may expend and roll a Hit Die to create temporary Hit Points or Force damage based on the roll.'),
  ],
});
write('feats', 'greater-aberrant-mark', {
  index: 'greater-aberrant-mark', name: 'Greater Aberrant Mark', category: 'general', source: source(43),
  description: 'Improve Aberrant Fortitude and channel Hit Dice into temporary Hit Points and Force damage.',
  prerequisite: { level: 4, feats: ['aberrant-dragonmark'] }, abilityIncrease: { abilities: ['constitution'], amount: 1 },
  grants: [
    feature('Improved Fortitude', 'Aberrant Fortitude uses a d6 and refreshes on a Short or Long Rest.', { key: 'aberrant-fortitude', action: { activation: 'reaction', uses: { max: 1, per: 'short_rest' } } }),
    feature('Mark of Inspiration', 'After casting a cantrip, expend Hit Dice to gain temporary Hit Points and deal Force damage.', { key: 'mark-of-inspiration', action: { activation: 'free', uses: { max: 1, maxProficiencyBonus: true, per: 'long_rest' } } }),
  ],
});
write('feats', 'potent-dragonmark', {
  index: 'potent-dragonmark', name: 'Potent Dragonmark', category: 'general', source: source(45),
  description: 'Always prepare your Spells of the Mark and gain a short-rest slot usable only for Dragonmark spells.',
  prerequisite: { level: 4, featTags: ['dragonmark'] },
  abilityIncrease: { abilities: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'], amount: 1 },
  grants: [{ type: 'dragonmark_slot', key: 'potent_dragonmark_slot', name: 'Dragonmark Spell Slot', maxLevel: 5, recovery: 'short_rest' }],
});

const siberysSpells = {
  'Mark of Handling': 'animal-shapes', 'Mark of Storm': 'control-weather', 'Mark of Making': 'demiplane',
  'Mark of Hospitality': 'heroes-feast', 'Mark of Warding': 'maze', 'Mark of Sentinel': 'mind-blank',
  'Mark of Passage': 'plane-shift', 'Mark of Shadow': 'project-image', 'Mark of Healing': 'regenerate',
  'Mark of Scribing': 'symbol', 'Mark of Finding': 'teleport', 'Mark of Detection': 'true-seeing',
};
write('feats', 'boon-of-siberys', {
  index: 'boon-of-siberys', name: 'Boon of Siberys', category: 'epic', source: source(45),
  description: 'Manifest an exceptional dragonmark and cast one associated high-level spell without a slot each Long Rest.',
  prerequisite: { level: 19 },
  abilityIncrease: { abilities: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'], amount: 1, maximum: 30 },
  grants: [
    choice('siberys_spellcasting_ability', 'Siberys Spellcasting Ability', abilityOptions, 'Choose the ability for the boon spell.'),
    {
      type: 'choice', key: 'siberys_manifestation', name: 'Siberys Manifestation', choose: 1,
      options: [
        ...Object.entries(siberysSpells).map(([name, spell]) => ({ name, grants: [{ type: 'spell_grant', key: `siberys_${spell}`, name: 'Boon of Siberys', destination: 'always_prepared', spells: [spell], countsAgainstLimit: false, sourceKey: 'boon-of-siberys', sourceName: 'Boon of Siberys', ability: { choiceKey: 'siberys_spellcasting_ability' }, freeCast: { uses: 1, recovery: 'long_rest' } }] })),
        { name: 'Aberrant Magic', grants: [{ type: 'spell_grant', key: 'siberys_sorcerer_spell', name: 'Boon of Siberys', destination: 'always_prepared', choose: 1, countsAgainstLimit: false, list: 'Sorcerer', sourceKey: 'boon-of-siberys', sourceName: 'Boon of Siberys', ability: { choiceKey: 'siberys_spellcasting_ability' }, filter: { minLevel: 1, maxLevel: 8 }, freeCast: { uses: 1, recovery: 'long_rest' } }] },
      ],
    },
  ],
});

const officialItems = {
  'Boots of the Winding Path': { category: 'Wondrous Item', rarity: 'uncommon', attunement: true, description: 'As a Bonus Action, teleport up to 15 feet to an unoccupied space you occupied earlier this turn.' },
  'Dazzling Weapon': { category: 'Magic Weapon Template', rarity: 'rare', attunement: true, description: 'A +1 weapon that can shed light and spend charges to try to blind a creature that hits its wielder.', charges: 4 },
  'Helm of Awareness': { category: 'Wondrous Item', rarity: 'uncommon', description: 'While worn, this helm grants Advantage on Initiative rolls.', effects: [{ type: 'initiative_advantage' }] },
  'Manifold Tool': { category: 'Wondrous Item', rarity: 'common', attunement: true, description: 'A transforming tool that supports artisan work and can grant temporary proficiency with its assumed form.' },
  'Mind Sharpener': { category: 'Wondrous Item', rarity: 'uncommon', attunement: true, description: 'A robe or suit of armor attachment with charges that can turn a failed Constitution save to maintain Concentration into a success.', charges: 4, action: { activation: 'reaction' } },
  'Repeating Shot': { category: 'Magic Weapon Template', rarity: 'uncommon', attunement: true, description: 'A +1 ranged weapon that ignores Loading and produces its own magical ammunition.' },
  'Repulsion Shield': { category: 'Shield', rarity: 'uncommon', description: 'A +1 shield with charges that can push a melee attacker away after it hits the wielder.', armor_class: '3', charges: 4, action: { activation: 'reaction' } },
  'Returning Weapon': { category: 'Magic Weapon Template', rarity: 'uncommon', description: 'A +1 thrown weapon that returns to the wielder after a ranged attack.' },
  'Spell-Refueling Ring': { category: 'Ring', rarity: 'uncommon', attunement: 'Spellcaster', description: 'Once per dawn as a Bonus Action, recover one expended spell slot of level 3 or lower.', charges: 1, action: { activation: 'bonus_action' } },
};
const rawItemByName = new Map(raw.items.item.filter((entry) => entry.source === 'EFA').map((entry) => [entry.name, entry]));
const rawVariantByName = new Map(raw.variants.magicvariant.filter((entry) => entry.inherits?.source === 'EFA').map((entry) => [entry.name, entry.inherits]));
for (const [name, config] of Object.entries(officialItems)) {
  const original = rawItemByName.get(name) ?? rawVariantByName.get(name);
  const index = slug(name);
  const actions = config.action ? [{
    key: `item:${index}`, name, description: config.description, activation: config.action.activation,
    uses: config.charges ? { max: config.charges, per: 'long_rest' } : undefined,
  }] : undefined;
  write('items', index, {
    index, name, type: config.category === 'Shield' ? 'armor' : 'magic', category: config.category,
    damage: null, damage_type: null, armor_class: config.armor_class, properties: [], weight: original?.weight ?? 0,
    cost: 'Magic item', description: config.description, rarity: config.rarity,
    requires_attunement: config.attunement ?? false, charges: config.charges ? { max: config.charges, recovery: 'dawn' } : undefined,
    actions, effects: config.effects, artificer_plan: { name, itemIndex: index }, source: source(original?.page ?? 112),
  });
}

const artificerFile = resolve(contentRoot, 'classes', 'artificer.json');
const artificer = JSON.parse(readFileSync(artificerFile, 'utf8'));
const planGrant = artificer.levels.flatMap((level) => level.grants ?? [])
  .find((grant) => grant.key === 'magic_item_plans');
if (!planGrant) throw new Error('Artificer Magic Item Plans grant is missing.');
planGrant.options = planGrant.options.map((option) => officialItems[option.name]
  ? { ...option, itemIndex: slug(option.name) }
  : option);
writeFileSync(artificerFile, `${JSON.stringify(artificer, null, 2)}\n`);

const sizeNames = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
const abilityNames = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const crXp = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000 };
const signedNumber = (value) => Number(String(value).replace('+', ''));
const referenceEntry = (name, page) => ({ name, description: `Reference-only rule. See Eberron: Forge of the Artificer, page ${page}.` });
const senses = (monster) => {
  const result = { passive_perception: monster.passive ?? 10 };
  for (const sense of monster.senses ?? []) {
    const match = sense.match(/(darkvision|blindsight|truesight|tremorsense)\s+(\d+)/i);
    if (match) result[match[1].toLowerCase()] = Number(match[2]);
  }
  return result;
};
for (const monster of raw.bestiary.monster.filter((entry) => entry.source === 'EFA')) {
  const type = typeof monster.type === 'string' ? monster.type : [monster.type.type, ...(monster.type.tags ?? [])].join(' (').replace(/$/, monster.type.tags?.length ? ')' : '');
  const armor = monster.ac?.[0];
  const armorClass = typeof armor === 'number' ? armor : armor?.ac ?? Number(String(armor?.special ?? '').match(/\d+/)?.[0] ?? 10);
  const actions = [
    ...(monster.action ?? []).map((entry) => referenceEntry(entry.name, monster.page)),
    ...(monster.bonus ?? []).map((entry) => referenceEntry(`${entry.name} (Bonus Action)`, monster.page)),
  ];
  const index = slug(monster.name);
  const isSteelDefender = index === 'steel-defender';
  const isHomunculus = index === 'homunculus-servant';
  if (isSteelDefender) {
    actions.splice(0, actions.length,
      { name: 'Force-Empowered Rend', description: 'Melee spell attack; on a hit, deal 1d8 + 2 + Intelligence modifier Force damage.' },
      { name: 'Repair (3/Day)', description: 'Restore 2d8 + Intelligence modifier Hit Points to itself or a nearby Construct or object.' });
  }
  if (isHomunculus) {
    actions.splice(0, actions.length,
      { name: 'Force Strike', description: 'Melee or ranged spell attack; on a hit, deal 1d6 + the summoning spell level Force damage.' });
  }
  write('monsters', index, {
    index, name: monster.name, size: sizeNames[monster.size?.[0]] ?? 'Medium', type,
    alignment: (monster.alignment ?? ['Unaligned']).join(' '), armor_class: armorClass,
    armor_class_desc: typeof armor === 'object' ? armor.special ?? armor.from?.join(', ') : undefined,
    hit_points: monster.hp?.average ?? 0, hit_points_formula: monster.hp?.special,
    hit_dice: monster.hp?.formula ?? (monster.hp?.special ? 'Special' : '0'), speed: monster.speed ?? { walk: 30 },
    ability_scores: { strength: monster.str, dexterity: monster.dex, constitution: monster.con, intelligence: monster.int, wisdom: monster.wis, charisma: monster.cha },
    saving_throws: Object.fromEntries(Object.entries(monster.save ?? {}).map(([key, value]) => [abilityNames[key] ?? title(key), signedNumber(value)])),
    skills: Object.fromEntries(Object.entries(monster.skill ?? {}).map(([key, value]) => [title(key), signedNumber(value)])),
    damage_vulnerabilities: monster.vulnerable ?? [], damage_resistances: monster.resist ?? [], damage_immunities: monster.immune ?? [], condition_immunities: monster.conditionImmune ?? [],
    senses: senses(monster), languages: monster.languages ?? [], challenge_rating: monster.cr ?? 'Special', xp: crXp[monster.cr] ?? 0,
    traits: (monster.trait ?? []).map((entry) => isSteelDefender && entry.name === 'Steel Bond'
      ? { name: entry.name, description: 'Add the creator’s Proficiency Bonus to the defender’s ability checks and saving throws.' }
      : isHomunculus && entry.name === 'Magic Bond'
        ? { name: entry.name, description: 'Add the summoning spell level to the homunculus’s ability checks and saving throws.' }
        : referenceEntry(entry.name, monster.page)),
    actions, reactions: (monster.reaction ?? []).map((entry) => isSteelDefender && entry.name === 'Deflect Attack'
      ? { name: entry.name, description: 'Impose Disadvantage on a nearby attack against a creature other than the defender.' }
      : isHomunculus && entry.name === 'Channel Magic'
        ? { name: entry.name, description: 'Deliver the summoner’s touch-range spell while within 120 feet.' }
        : referenceEntry(entry.name, monster.page)),
    legendary_actions: (monster.legendary ?? []).map((entry) => referenceEntry(entry.name, monster.page)),
    description: `Reference stat block from Eberron: Forge of the Artificer, page ${monster.page}.`,
    rules_text: 'reference-only', source: source(monster.page),
  });
}

console.log(`Imported ${races.length} species, ${backgroundRows.length} backgrounds, 28 feats, ${Object.keys(officialItems).length} items, and ${raw.bestiary.monster.length} monsters for EFA.`);
