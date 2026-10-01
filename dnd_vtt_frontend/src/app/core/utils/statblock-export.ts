import { ABILITIES, Character, SKILLS } from '../models/character.model';
import { DndMonster } from '../services/content.service';
import { CharacterAction } from '../services/character-actions.service';
import { ComputedStats, WeaponAttack } from '../services/character-stats.service';

// Exports monsters and characters as an Obsidian "Fantasy Statblocks" plugin block — a
// ```statblock fenced code block whose body is YAML in the plugin's 5e schema (name, ac, hp,
// stats, saves, skillsaves, traits/actions/... as {name, desc} lists). No `layout` key is
// written, so the reader's own default layout in Obsidian applies.

type YamlScalar = string | number | boolean;
type YamlValue = YamlScalar | YamlValue[] | { [key: string]: YamlValue | undefined };

// JSON string literals are valid YAML double-quoted scalars, which sidesteps every YAML special
// character (colons, leading dashes, `#`, quotes) that shows up in 5e rules text.
function scalar(value: YamlScalar): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function isScalar(value: YamlValue): value is YamlScalar {
  return typeof value !== 'object';
}

function key(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : JSON.stringify(name);
}

function entry(name: string, value: YamlValue, indent: string): string[] {
  if (isScalar(value)) return [`${indent}${key(name)}: ${scalar(value)}`];
  if (Array.isArray(value) && value.length === 0) return [`${indent}${key(name)}: []`];
  return [`${indent}${key(name)}:`, ...block(value, `${indent}  `)];
}

function block(value: YamlValue, indent: string): string[] {
  if (isScalar(value)) return [`${indent}${scalar(value)}`];
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (isScalar(item)) return [`${indent}- ${scalar(item)}`];
      const lines = block(item, `${indent}  `);
      lines[0] = `${indent}- ${lines[0].slice(indent.length + 2)}`;
      return lines;
    });
  }
  return Object.entries(value)
    .filter((pair): pair is [string, YamlValue] => pair[1] !== undefined)
    .flatMap(([name, child]) => entry(name, child, indent));
}

export function toYaml(doc: Record<string, YamlValue | undefined>): string {
  return block(doc, '').join('\n');
}

function fence(doc: Record<string, YamlValue | undefined>): string {
  return '```statblock\n' + toYaml(doc) + '\n```\n';
}

interface NamedBlock { [key: string]: string; name: string; desc: string }

// Empty lists are dropped rather than written as `[]` so the plugin doesn't render empty headers.
function list<T>(items: T[] | undefined): T[] | undefined {
  return items?.length ? items : undefined;
}

function text(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function monsterSpeed(speed: DndMonster['speed']): string {
  const parts: string[] = [];
  if (speed.walk != null) parts.push(`${speed.walk} ft.`);
  for (const mode of ['burrow', 'climb', 'fly', 'swim'] as const) {
    if (speed[mode] != null) parts.push(`${mode} ${speed[mode]} ft.`);
  }
  return parts.join(', ');
}

function monsterSenses(senses: DndMonster['senses']): string {
  const parts: string[] = [];
  for (const sense of ['blindsight', 'darkvision', 'tremorsense', 'truesight'] as const) {
    if (senses[sense]) parts.push(`${sense} ${senses[sense]} ft.`);
  }
  parts.push(`passive Perception ${senses.passive_perception}`);
  return parts.join(', ');
}

// {"Constitution": 6} → [{constitution: 6}] — the plugin's saves/skillsaves are lists of
// single-key maps, keyed lowercase.
function bonusList(bonuses: Record<string, number> | undefined): Record<string, number>[] | undefined {
  return list(Object.entries(bonuses ?? {}).map(([name, value]) => ({ [name.toLowerCase()]: value })));
}

function blocks(entries: { name: string; description: string }[] | undefined): NamedBlock[] | undefined {
  return list(entries?.map(e => ({ name: e.name, desc: e.description })));
}

export function monsterStatblock(monster: DndMonster): string {
  return fence({
    name: monster.name,
    size: monster.size,
    type: monster.type,
    alignment: monster.alignment,
    ac: monster.armor_class_desc ? `${monster.armor_class} (${monster.armor_class_desc})` : monster.armor_class,
    hp: monster.hit_points,
    hit_dice: text(monster.hit_dice),
    speed: monsterSpeed(monster.speed),
    stats: ABILITIES.map(ability => monster.ability_scores[ability]),
    saves: bonusList(monster.saving_throws),
    skillsaves: bonusList(monster.skills),
    damage_vulnerabilities: text(monster.damage_vulnerabilities?.join(', ')),
    damage_resistances: text(monster.damage_resistances?.join(', ')),
    damage_immunities: text(monster.damage_immunities?.join(', ')),
    condition_immunities: text(monster.condition_immunities?.join(', ')),
    senses: monsterSenses(monster.senses),
    languages: monster.languages.join(', ') || '—',
    cr: monster.challenge_rating,
    traits: blocks(monster.traits),
    actions: blocks(monster.actions),
    reactions: blocks(monster.reactions),
    legendary_description: monster.legendary_actions?.length
      ? `The ${monster.name.toLowerCase()} can take 3 legendary actions, choosing from the options below. Only one legendary action can be used at a time and only at the end of another creature's turn. The ${monster.name.toLowerCase()} regains spent legendary actions at the start of its turn.`
      : undefined,
    legendary_actions: blocks(monster.legendary_actions),
  });
}

export interface StatblockFeature {
  name: string;
  source?: string;
  detail?: string;
}

export interface StatblockSpellGroup {
  label: string; // e.g. "Cantrips (at will)", "1st level (4 slots)"
  spells: string[];
}

// Everything the character sheet has already resolved from content — the export doesn't
// re-derive stats, it formats what the play sheet is showing.
export interface CharacterStatblockInput {
  character: Character;
  stats: ComputedStats;
  size?: string;
  hitDice?: string;
  darkvisionFt?: number | null;
  features: StatblockFeature[];
  actions: CharacterAction[];
  spellcasting?: {
    ability: string;
    groups: StatblockSpellGroup[];
  };
}

function attackDesc(attack: WeaponAttack): string {
  const kind = attack.distance.includes('reach') ? 'Melee' : 'Ranged';
  const distance = attack.distance.replace(/(\d+) ft\. reach/, 'reach $1 ft.').replace(/ · /g, ' or range ');
  const damageType = attack.damage_type ? ` ${capitalize(attack.damage_type)}` : '';
  const damage = attack.damage_dice
    ? `${attack.damage_dice}${attack.damage_bonus ? ` ${attack.damage_bonus > 0 ? '+' : '−'} ${Math.abs(attack.damage_bonus)}` : ''}`
    : `${Math.max(1, attack.damage_bonus)}`;
  const versatile = attack.versatile_damage_dice
    ? `, or ${attack.versatile_damage_dice}${attack.damage_bonus ? ` ${attack.damage_bonus > 0 ? '+' : '−'} ${Math.abs(attack.damage_bonus)}` : ''}${damageType} damage if used with two hands`
    : '';
  const mastery = attack.mastery ? ` Mastery: ${attack.mastery.property}.` : '';
  const reach = distance ? `, ${distance.replace(/\.$/, '')}` : '';
  return `${kind} Attack Roll: ${signed(attack.attack_bonus)}${reach}. Hit: ${damage}${damageType} damage${versatile}.${mastery}`;
}

function usesSuffix(action: CharacterAction): string {
  if (action.unlimited || action.maxUses <= 0) return '';
  return ` (${action.maxUses}/${action.per === 'short_rest' ? 'Short Rest' : 'Long Rest'})`;
}

function actionBlock(action: CharacterAction): NamedBlock {
  return { name: `${action.name}${usesSuffix(action)}`, desc: action.description || action.source };
}

export function characterStatblock(input: CharacterStatblockInput): string {
  const { character: char, stats } = input;
  const raceLabel = char.subrace ? `${char.race} (${char.subrace})` : char.race;
  const classLabel = char.classes?.length
    ? char.classes.map(c => `${c.subclass ? `${c.name} (${c.subclass})` : c.name} ${c.level}`).join(' / ')
    : `${char.subclass ? `${char.class} (${char.subclass})` : char.class} ${char.level}`;

  const proficientSkills = Object.keys(SKILLS).filter(skill => char.skills?.[skill] || char.expertise?.[skill]);
  const senses = [
    input.darkvisionFt ? `darkvision ${input.darkvisionFt} ft.` : '',
    `passive Perception ${stats.passive_perception}`,
  ].filter(Boolean).join(', ');

  const traits: NamedBlock[] = input.features.map(feature => ({
    name: feature.name,
    desc: feature.detail || (feature.source ? `${feature.source} feature.` : ''),
  }));

  const attacks = [stats.unarmed_attack, ...stats.weapon_attacks].filter(Boolean);
  const actions: NamedBlock[] = [
    ...(attacks.length > 1 ? [{
      name: 'Attack',
      desc: `${char.name} makes an attack with a weapon or an Unarmed Strike.`,
    }] : []),
    ...attacks.map(attack => ({ name: attack.name, desc: attackDesc(attack) })),
    ...input.actions.filter(a => a.activation === 'action' || a.activation === 'free').map(actionBlock),
  ];

  const spellcasting = input.spellcasting?.groups.length && stats.spell_save_dc != null
    ? [
        `${char.name} is a spellcaster. Its spellcasting ability is ${input.spellcasting.ability} (spell save DC ${stats.spell_save_dc}, ${signed(stats.spell_attack_bonus ?? 0)} to hit with spell attacks).`,
        ...input.spellcasting.groups.map(group => ({ [group.label]: group.spells.join(', ') })),
      ]
    : undefined;

  return fence({
    name: char.name,
    size: input.size || 'Medium',
    type: 'humanoid',
    // The plugin renders subtype in parentheses after the type — the closest slot it has for
    // "who this is" on a PC, since `cr` would print as a Challenge rating.
    subtype: [raceLabel, classLabel, char.background].filter(Boolean).join(', '),
    alignment: char.alignment,
    ac: stats.computed_ac,
    hp: char.max_hp,
    hit_dice: text(input.hitDice),
    speed: `${char.speed} ft.`,
    stats: ABILITIES.map(ability => char.ability_scores[ability]),
    saves: list(ABILITIES
      .filter(ability => stats.saving_throw_proficient.has(ability))
      .map(ability => ({ [ability]: stats.saving_throw_bonuses[ability] }))),
    skillsaves: list(proficientSkills.map(skill => ({ [skill.toLowerCase()]: stats.skill_bonuses[skill] }))),
    senses,
    languages: (char.languages ?? []).join(', ') || '—',
    traits: list(traits),
    spells: spellcasting,
    actions: list(actions),
    bonus_actions: list(input.actions.filter(a => a.activation === 'bonus_action').map(actionBlock)),
    reactions: list(input.actions.filter(a => a.activation === 'reaction').map(actionBlock)),
  });
}

// A standalone Obsidian note: the statblock plus any flavour text the plugin has no field for.
export function statblockNote(statblock: string, description?: string): string {
  return description?.trim() ? `${description.trim()}\n\n${statblock}` : statblock;
}

export function statblockFileName(name: string): string {
  return `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'statblock'}.md`;
}
