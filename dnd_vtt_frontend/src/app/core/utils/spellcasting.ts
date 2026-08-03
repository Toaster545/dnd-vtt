import { abilityModifier, proficiencyBonus, type Ability, type AbilityScores } from '../models/character.model';
import type {
  ClassLevel,
  DndBackground,
  DndClass,
  DndFeat,
  DndRace,
  DndSpell,
  SpellcastingAbility,
  SpellcastingDefinition,
  Subclass,
  TraitGrant,
} from '../services/content.service';

export type SpellSelectionKind = 'cantrips' | 'known' | 'spellbook' | 'prepared' | 'bonus';
export type ResolvedSpellCategory = 'known' | 'spellbook' | 'prepared' | 'always_prepared';

export interface SpellcastingClassSelection {
  cls: DndClass;
  level: number;
  subclass?: string;
  choices?: Record<string, string[]>;
}

export interface SpellcastingRaceSelection {
  race: DndRace;
  subrace?: DndRace['subraces'][number] | null;
  choices?: Record<string, string[]>;
}

export interface SpellcastingBackgroundSelection {
  background: DndBackground;
  choices?: Record<string, string[]>;
}

export interface SpellcastingFeatSelection {
  feat: DndFeat;
  scope: string;
  choices?: Record<string, string[]>;
  ability?: string;
}

export interface SpellcastingResolverInput {
  characterLevel: number;
  abilityScores: AbilityScores;
  spells: DndSpell[];
  classes: SpellcastingClassSelection[];
  race?: SpellcastingRaceSelection | null;
  background?: SpellcastingBackgroundSelection | null;
  feats?: SpellcastingFeatSelection[];
  spellChoices?: Record<string, string[]>;
}

export interface SpellValidationError {
  code:
    | 'unknown_spell'
    | 'ineligible_spell'
    | 'duplicate_spell'
    | 'too_many_selections'
    | 'insufficient_eligible_spells'
    | 'missing_casting_ability';
  message: string;
  requirementKey?: string;
  spellIndex?: string;
}

export interface ResolvedSpellcastingSource {
  key: string;
  name: string;
  subclassName?: string;
  origin: 'class' | 'subclass' | 'race' | 'background' | 'feat' | 'grant';
  list: string | null;
  mode: SpellcastingDefinition['mode'] | 'granted';
  progression: SpellcastingDefinition['progression'] | 'none';
  castingAbility: Ability | null;
  spellAttackBonus: number | null;
  spellSaveDc: number | null;
  maxSpellLevel: number;
}

export interface SpellSelectionRequirement {
  key: string;
  sourceKey: string;
  sourceName: string;
  name: string;
  subclassName?: string;
  kind: SpellSelectionKind;
  destination: ResolvedSpellCategory;
  required: number;
  selectedSpellIndices: string[];
  validSelectedSpellIndices: string[];
  invalidSelectedSpellIndices: string[];
  eligibleSpellIndices: string[];
  unavailableSpellIndices: string[];
  unavailableSpellSources: Record<string, string>;
  remaining: number;
  countsAgainstLimit: boolean;
  errors: SpellValidationError[];
}

export interface ResolvedSpellOrigin {
  spellIndex: string;
  sourceKey: string;
  sourceName: string;
  subclassName?: string;
  category: ResolvedSpellCategory;
  castingAbility: Ability | null;
  spellAttackBonus: number | null;
  spellSaveDc: number | null;
  granted: boolean;
  countsAgainstLimit: boolean;
}

export interface ResolvedSpellSlotPool {
  key: string;
  name: string;
  type: 'normal' | 'pact';
  slots: Record<string, number>;
  pactSlotLevel?: number;
}

export interface SpellcastingResolution {
  sources: ResolvedSpellcastingSource[];
  requirements: SpellSelectionRequirement[];
  known: ResolvedSpellOrigin[];
  spellbook: ResolvedSpellOrigin[];
  prepared: ResolvedSpellOrigin[];
  alwaysPrepared: ResolvedSpellOrigin[];
  slotPools: ResolvedSpellSlotPool[];
  validationErrors: SpellValidationError[];
  isComplete: boolean;
}

interface ActiveSource extends ResolvedSpellcastingSource {
  definition?: SpellcastingDefinition;
  level: number;
  levelContent?: ClassLevel | Subclass['levels'][number];
  choices: Record<string, string[]>;
  spellSlots: Record<string, number>;
  pactMagic?: { slots: number; slot_level: number };
  cantripLimit: number;
  spellLimit: number;
  preparedLimit: number;
}

interface GrantContext {
  grant: Extract<TraitGrant, { type: 'spell_grant' }>;
  scope: string;
  origin: ResolvedSpellcastingSource['origin'];
  sourceName: string;
  subclassName?: string;
  choices: Record<string, string[]>;
  inheritedSourceKey?: string;
  sourceLevel?: number;
}

interface PendingRequirement {
  key: string;
  source: ActiveSource;
  name: string;
  subclassName?: string;
  kind: SpellSelectionKind;
  destination: ResolvedSpellCategory;
  required: number;
  eligible: DndSpell[];
  countsAgainstLimit: boolean;
  granted: boolean;
  usesGlobalUniqueness: boolean;
}

interface SpellAcquisitionOwner {
  requirementKey?: string;
  sourceName: string;
}

const MULTICLASS_SLOTS: Record<number, Record<string, number>> = {
  1: { '1': 2 },
  2: { '1': 3 },
  3: { '1': 4, '2': 2 },
  4: { '1': 4, '2': 3 },
  5: { '1': 4, '2': 3, '3': 2 },
  6: { '1': 4, '2': 3, '3': 3 },
  7: { '1': 4, '2': 3, '3': 3, '4': 1 },
  8: { '1': 4, '2': 3, '3': 3, '4': 2 },
  9: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 },
  10: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2 },
  11: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
  12: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
  13: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
  14: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
  15: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
  16: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
  17: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1 },
  18: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 1, '7': 1, '8': 1, '9': 1 },
  19: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 1, '8': 1, '9': 1 },
  20: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 2, '8': 1, '9': 1 },
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function maxSlotLevel(slots: Record<string, number>, pactLevel?: number): number {
  return Math.max(0, pactLevel ?? 0, ...Object.keys(slots).map(Number));
}

function resolveAbility(
  ability: SpellcastingAbility | undefined,
  choices: Record<string, string[]>,
): Ability | null {
  const value = typeof ability === 'string' ? ability : ability ? choices[ability.choiceKey]?.[0] : undefined;
  if (!value) return null;
  const normalized = normalize(value) as Ability;
  return ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(normalized)
    ? normalized
    : null;
}

function publicSource(source: ActiveSource): ResolvedSpellcastingSource {
  const { key, name, subclassName, origin, list, mode, progression, castingAbility, spellAttackBonus, spellSaveDc, maxSpellLevel } = source;
  return { key, name, subclassName, origin, list, mode, progression, castingAbility, spellAttackBonus, spellSaveDc, maxSpellLevel };
}

function createSource(
  key: string,
  name: string,
  origin: ResolvedSpellcastingSource['origin'],
  definition: SpellcastingDefinition | undefined,
  level: number,
  levelContent: ActiveSource['levelContent'],
  choices: Record<string, string[]>,
  abilityScores: AbilityScores,
  characterLevel: number,
): ActiveSource {
  const spellSlots = (levelContent?.spell_slots ?? {}) as Record<string, number>;
  const pactMagic = levelContent?.pact_magic;
  const castingAbility = resolveAbility(definition?.ability, choices);
  const modifier = castingAbility ? abilityModifier(abilityScores[castingAbility]) : null;
  const prof = proficiencyBonus(characterLevel);
  return {
    key,
    name,
    origin,
    definition,
    level,
    levelContent,
    choices,
    list: definition?.list ?? null,
    mode: definition?.mode ?? 'granted',
    progression: definition?.progression ?? 'none',
    castingAbility,
    spellAttackBonus: modifier === null ? null : prof + modifier,
    spellSaveDc: modifier === null ? null : 8 + prof + modifier,
    spellSlots,
    pactMagic,
    cantripLimit: levelContent?.cantrips_known ?? 0,
    spellLimit: definition?.mode === 'spellbook'
      ? levelContent?.spells_known ?? 0
      : definition?.mode === 'known'
        ? levelContent?.spells_known ?? 0
        : levelContent?.prepared_spells ?? 0,
    preparedLimit: definition?.mode === 'spellbook' ? levelContent?.prepared_spells ?? 0 : 0,
    maxSpellLevel: maxSlotLevel(spellSlots, pactMagic?.slot_level),
  };
}

function activeClassSources(input: SpellcastingResolverInput): ActiveSource[] {
  const sources: ActiveSource[] = [];
  for (const selection of input.classes) {
    const choices = selection.choices ?? {};
    const classLevel = selection.cls.levels.find((level) => level.level === selection.level);
    if (selection.cls.spellcasting && classLevel) {
      sources.push(createSource(
        selection.cls.spellcasting.key,
        selection.cls.spellcasting.name ?? selection.cls.name,
        'class',
        selection.cls.spellcasting,
        selection.level,
        classLevel,
        choices,
        input.abilityScores,
        input.characterLevel,
      ));
    }

    const subclass = selection.cls.subclasses.find((candidate) => candidate.name === selection.subclass);
    const subclassLevel = subclass?.levels.find((level) => level.level === selection.level);
    if (subclass?.spellcasting && subclassLevel) {
      const source = createSource(
        subclass.spellcasting.key,
        subclass.spellcasting.name ?? `${selection.cls.name} (${subclass.name})`,
        'subclass',
        subclass.spellcasting,
        selection.level,
        subclassLevel,
        choices,
        input.abilityScores,
        input.characterLevel,
      );
      source.subclassName = subclass.name;
      sources.push(source);
    }
  }
  return sources;
}

function optionSpellGrants(
  grants: TraitGrant[],
  choices: Record<string, string[]>,
  context: Omit<GrantContext, 'grant'>,
): GrantContext[] {
  const out: GrantContext[] = [];
  for (const grant of grants) {
    if (grant.type === 'spell_grant') out.push({ ...context, grant });
    if (grant.type !== 'choice') continue;
    const selected = new Set(choices[grant.key] ?? []);
    for (const option of grant.options) {
      if (!selected.has(option.name)) continue;
      out.push(...optionSpellGrants(option.grants ?? [], choices, {
        ...context,
        scope: `${context.scope}:option:${grant.key}:${normalize(option.name).replace(/\s+/g, '-')}`,
        sourceName: option.name,
      }));
    }
  }
  return out;
}

function activeSpellGrants(input: SpellcastingResolverInput, sources: ActiveSource[]): GrantContext[] {
  const contexts: GrantContext[] = [];
  if (input.race) {
    const choices = input.race.choices ?? {};
    contexts.push(...optionSpellGrants(input.race.race.grants ?? [], choices, {
      scope: `race:${input.race.race.index}`,
      origin: 'race',
      sourceName: input.race.race.name,
      choices,
    }));
    if (input.race.subrace) {
      contexts.push(...optionSpellGrants(input.race.subrace.grants ?? [], choices, {
        scope: `race:${input.race.race.index}:subrace:${input.race.subrace.index}`,
        origin: 'race',
        sourceName: input.race.subrace.name,
        choices,
      }));
    }
  }
  if (input.background) {
    const choices = input.background.choices ?? {};
    contexts.push(...optionSpellGrants(input.background.background.grants ?? [], choices, {
      scope: `background:${input.background.background.index}`,
      origin: 'background',
      sourceName: input.background.background.name,
      choices,
    }));
  }
  for (const selection of input.classes) {
    const choices = selection.choices ?? {};
    const classSource = sources.find((source) => source.definition === selection.cls.spellcasting);
    const classLevels = selection.cls.levels.filter((level) => level.level <= selection.level);
    for (const level of classLevels) {
      contexts.push(...optionSpellGrants(level.grants ?? [], choices, {
        scope: `class:${selection.cls.index}:level:${level.level}`,
        origin: 'class',
        sourceName: selection.cls.name,
      choices,
      sourceLevel: selection.level,
      inheritedSourceKey: classSource?.key,
      }));
    }
    const subclass = selection.cls.subclasses.find((candidate) => candidate.name === selection.subclass);
    const subclassSource = sources.find((source) => source.definition === subclass?.spellcasting) ?? classSource;
    for (const level of subclass?.levels.filter((candidate) => candidate.level <= selection.level) ?? []) {
      contexts.push(...optionSpellGrants(level.grants ?? [], choices, {
        scope: `class:${selection.cls.index}:subclass:${subclass!.index}:level:${level.level}`,
        origin: 'subclass',
        sourceName: subclass!.name,
        subclassName: subclass!.name,
        choices,
        sourceLevel: selection.level,
        inheritedSourceKey: subclassSource?.key,
      }));
    }
  }
  for (const selection of input.feats ?? []) {
    const choices = {
      ...(selection.choices ?? {}),
      ...(selection.ability ? { __feat_ability__: [selection.ability] } : {}),
    };
    contexts.push(...optionSpellGrants(selection.feat.grants ?? [], choices, {
      scope: `feat:${selection.scope}:${selection.feat.index}`,
      origin: 'feat',
      sourceName: selection.feat.name,
      choices,
    }));
  }
  return contexts.filter((context) =>
    (!context.grant.characterLevel || input.characterLevel >= context.grant.characterLevel)
    && (!context.grant.classLevel || (context.sourceLevel ?? 0) >= context.grant.classLevel));
}

function spellOnList(spell: DndSpell, list: string): boolean {
  return spell.classes.some((candidate) => normalize(candidate) === normalize(list));
}

function eligibleForGrant(spell: DndSpell, grant: GrantContext['grant'], source: ActiveSource): boolean {
  const lists = grant.filter?.lists ?? (grant.list ? [grant.list] : source.list ? [source.list] : []);
  if (lists.length && !lists.some((list) => spellOnList(spell, list))) return false;
  if (grant.filter?.schools?.length && !grant.filter.schools.some((school) => normalize(school) === normalize(spell.school))) return false;
  if (grant.filter?.minLevel !== undefined && spell.level < grant.filter.minLevel) return false;
  if (grant.filter?.maxLevel !== undefined && spell.level > grant.filter.maxLevel) return false;
  if (grant.filter?.exactLevels?.length && !grant.filter.exactLevels.includes(spell.level)) return false;
  if (grant.filter?.ritual !== undefined && spell.ritual !== grant.filter.ritual) return false;
  if (grant.filter?.spellAttack && !spell.mechanics?.spell_attacks?.length) return false;
  if (grant.filter?.castingTimes?.length) {
    const castingTime = normalize(spell.casting_time).replace(/^1\s+/, '');
    if (!grant.filter.castingTimes.some((time) => castingTime === normalize(time).replace(/^1\s+/, ''))) return false;
  }
  return true;
}

function grantSource(
  context: GrantContext,
  sourceByKey: Map<string, ActiveSource>,
  input: SpellcastingResolverInput,
): ActiveSource {
  if (context.inheritedSourceKey && !context.grant.sourceKey) return sourceByKey.get(context.inheritedSourceKey)!;
  const key = `grant:${context.scope}:${context.grant.sourceKey ?? context.grant.key}`;
  const existing = sourceByKey.get(key);
  if (existing) return existing;
  const definition: SpellcastingDefinition = {
    key,
    name: context.grant.sourceName ?? context.sourceName,
    list: context.grant.list ?? context.grant.filter?.lists?.[0] ?? '',
    ability: context.grant.ability ?? { choiceKey: '__missing_spellcasting_ability__' },
    mode: 'known',
    progression: 'full',
  };
  const source = createSource(
    key,
    definition.name!,
    context.origin === 'class' || context.origin === 'subclass' ? context.origin : context.origin,
    definition,
    input.characterLevel,
    undefined,
    context.choices,
    input.abilityScores,
    input.characterLevel,
  );
  source.mode = 'granted';
  source.progression = 'none';
  source.maxSpellLevel = context.grant.filter?.maxLevel ?? Math.max(0, ...(context.grant.spells ?? [])
    .map((index) => input.spells.find((spell) => spell.index === index)?.level ?? 0));
  sourceByKey.set(key, source);
  return source;
}

function reasonIneligible(spell: DndSpell, pending: PendingRequirement): string {
  if (pending.kind === 'cantrips' && spell.level !== 0) return `${spell.name} is not a cantrip.`;
  if (pending.kind !== 'cantrips' && spell.level === 0) return `${spell.name} is a cantrip and belongs in the Cantrips section.`;
  if (pending.source.list && !spellOnList(spell, pending.source.list)) return `${spell.name} is not on the ${pending.source.list} spell list.`;
  if (spell.level > pending.source.maxSpellLevel && pending.kind !== 'bonus') {
    return `${spell.name} is level ${spell.level}, but ${pending.source.name} can select only level ${pending.source.maxSpellLevel} spells.`;
  }
  return `${spell.name} does not meet this selection's list, level, or school requirements.`;
}

function validateRequirement(
  pending: PendingRequirement,
  choices: Record<string, string[]>,
  spellByIndex: Map<string, DndSpell>,
  acquisitionOwners: Map<string, SpellAcquisitionOwner>,
): SpellSelectionRequirement {
  const selected = choices[pending.key] ?? [];
  const eligible = new Set(pending.eligible.map((spell) => spell.index));
  const valid: string[] = [];
  const invalid = new Set<string>();
  const errors: SpellValidationError[] = [];
  const local = new Set<string>();

  for (const index of selected) {
    const spell = spellByIndex.get(index);
    if (!spell) {
      invalid.add(index);
      errors.push({ code: 'unknown_spell', requirementKey: pending.key, spellIndex: index, message: `Unknown spell "${index}" is selected.` });
      continue;
    }
    if (local.has(index)) {
      invalid.add(index);
      errors.push({ code: 'duplicate_spell', requirementKey: pending.key, spellIndex: index, message: `${spell.name} is selected more than once.` });
      continue;
    }
    local.add(index);
    if (!eligible.has(index)) {
      invalid.add(index);
      errors.push({ code: 'ineligible_spell', requirementKey: pending.key, spellIndex: index, message: reasonIneligible(spell, pending) });
      continue;
    }
    const owner = pending.usesGlobalUniqueness ? acquisitionOwners.get(index) : undefined;
    if (owner && owner.requirementKey !== pending.key) {
      invalid.add(index);
      errors.push({
        code: 'duplicate_spell',
        requirementKey: pending.key,
        spellIndex: index,
        message: `${spell.name} is already selected from ${owner.sourceName}. Remove it there before selecting it here.`,
      });
      continue;
    }
    if (valid.length >= pending.required) {
      invalid.add(index);
      errors.push({ code: 'too_many_selections', requirementKey: pending.key, spellIndex: index, message: `${pending.name} allows ${pending.required} selection${pending.required === 1 ? '' : 's'}.` });
      continue;
    }
    valid.push(index);
    if (pending.usesGlobalUniqueness) {
      acquisitionOwners.set(index, { requirementKey: pending.key, sourceName: pending.name });
    }
  }

  if (pending.eligible.length < pending.required) {
    errors.push({
      code: 'insufficient_eligible_spells',
      requirementKey: pending.key,
      message: `${pending.name} requires ${pending.required} selections, but only ${pending.eligible.length} are currently eligible. Complete its prerequisite spell choices first.`,
    });
  }

  return {
    key: pending.key,
    sourceKey: pending.source.key,
    sourceName: pending.source.name,
    name: pending.name,
    subclassName: pending.subclassName,
    kind: pending.kind,
    destination: pending.destination,
    required: pending.required,
    selectedSpellIndices: [...selected],
    validSelectedSpellIndices: valid,
    invalidSelectedSpellIndices: [...invalid],
    eligibleSpellIndices: pending.eligible.map((spell) => spell.index),
    unavailableSpellIndices: [],
    unavailableSpellSources: {},
    remaining: Math.max(0, pending.required - valid.length),
    countsAgainstLimit: pending.countsAgainstLimit,
    errors,
  };
}

function addResolved(
  target: ResolvedSpellOrigin[],
  index: string,
  source: ActiveSource,
  category: ResolvedSpellCategory,
  granted: boolean,
  countsAgainstLimit: boolean,
  subclassName?: string,
): void {
  if (target.some((entry) => entry.spellIndex === index && entry.sourceKey === source.key && entry.category === category)) return;
  target.push({
    spellIndex: index,
    sourceKey: source.key,
    sourceName: source.name,
    subclassName: subclassName ?? source.subclassName,
    category,
    castingAbility: source.castingAbility,
    spellAttackBonus: source.spellAttackBonus,
    spellSaveDc: source.spellSaveDc,
    granted,
    countsAgainstLimit,
  });
}

function slotPools(sources: ActiveSource[]): ResolvedSpellSlotPool[] {
  const pools: ResolvedSpellSlotPool[] = [];
  const normal = sources.filter((source) => source.progression !== 'pact' && Object.keys(source.spellSlots).length);
  if (normal.length === 1) {
    pools.push({ key: 'spellcasting', name: 'Spell Slots', type: 'normal', slots: { ...normal[0].spellSlots } });
  } else if (normal.length > 1) {
    const casterLevel = Math.min(20, normal.reduce((total, source) => {
      if (source.progression === 'full') return total + source.level;
      if (source.progression === 'half') return total + Math.ceil(source.level / 2);
      if (source.progression === 'third') return total + Math.floor(source.level / 3);
      return total;
    }, 0));
    if (casterLevel > 0) pools.push({ key: 'spellcasting', name: 'Spell Slots', type: 'normal', slots: { ...MULTICLASS_SLOTS[casterLevel] } });
  }
  for (const source of sources.filter((candidate) => candidate.progression === 'pact' && candidate.pactMagic)) {
    pools.push({
      key: `pact:${source.key}`,
      name: `${source.name} Pact Magic`,
      type: 'pact',
      slots: { [String(source.pactMagic!.slot_level)]: source.pactMagic!.slots },
      pactSlotLevel: source.pactMagic!.slot_level,
    });
  }
  return pools;
}

export function resolveSpellcasting(input: SpellcastingResolverInput): SpellcastingResolution {
  const choices = input.spellChoices ?? {};
  const spellByIndex = new Map(input.spells.map((spell) => [spell.index, spell]));
  const sources = activeClassSources(input);
  const sourceByKey = new Map(sources.map((source) => [source.key, source]));
  const grants = activeSpellGrants(input, sources);
  const pending: PendingRequirement[] = [];
  const known: ResolvedSpellOrigin[] = [];
  const spellbook: ResolvedSpellOrigin[] = [];
  const prepared: ResolvedSpellOrigin[] = [];
  const alwaysPrepared: ResolvedSpellOrigin[] = [];
  const validationErrors: SpellValidationError[] = [];
  const fixedCount = new Map<string, number>();
  const acquisitionOwners = new Map<string, SpellAcquisitionOwner>();
  const dependentGrants: { context: GrantContext; source: ActiveSource }[] = [];

  for (const context of grants) {
    const grant = context.grant;
    const source = grantSource(context, sourceByKey, input);
    if (!sources.includes(source)) sources.push(source);
    if (!source.castingAbility) {
      validationErrors.push({
        code: 'missing_casting_ability',
        message: `${source.name} needs a spellcasting ability choice.`,
      });
    }
    const destination = grant.destination;
    const target = destination === 'known' ? known : destination === 'spellbook' ? spellbook : alwaysPrepared;
    for (const index of grant.spells ?? []) {
      if (!spellByIndex.has(index)) {
        validationErrors.push({ code: 'unknown_spell', spellIndex: index, message: `${grant.name} references unknown spell "${index}".` });
        continue;
      }
      addResolved(target, index, source, destination, true, grant.countsAgainstLimit ?? false, context.subclassName);
      acquisitionOwners.set(index, { sourceName: grant.name });
      if (grant.countsAgainstLimit) {
        const key = `${source.key}:${destination}`;
        fixedCount.set(key, (fixedCount.get(key) ?? 0) + 1);
      }
    }
    if ((grant.choose ?? 0) > 0) {
      if (grant.fromDestination) {
        dependentGrants.push({ context, source });
        continue;
      }
      if (grant.countsAgainstLimit) {
        const key = `${source.key}:${destination}`;
        fixedCount.set(key, (fixedCount.get(key) ?? 0) + grant.choose!);
      }
      pending.push({
        key: `${context.scope}:grant:${grant.key}`,
        source,
        name: grant.name,
        subclassName: context.subclassName,
        kind: 'bonus',
        destination,
        required: grant.choose!,
        eligible: input.spells.filter((spell) => eligibleForGrant(spell, grant, source)),
        countsAgainstLimit: grant.countsAgainstLimit ?? false,
        granted: true,
        usesGlobalUniqueness: true,
      });
    }
  }

  for (const source of sources.filter((candidate) => candidate.definition && candidate.progression !== 'none')) {
    const listSpells = input.spells.filter((spell) => source.list && spellOnList(spell, source.list));
    if (source.cantripLimit > 0) {
      pending.push({
        key: `${source.key}:cantrips`, source, name: `${source.name} Cantrips`, kind: 'cantrips', destination: 'known',
        subclassName: source.subclassName,
        required: Math.max(0, source.cantripLimit - (fixedCount.get(`${source.key}:known`) ?? 0)),
        eligible: listSpells.filter((spell) => spell.level === 0), countsAgainstLimit: true, granted: false,
        usesGlobalUniqueness: true,
      });
    }
    if (source.spellLimit > 0) {
      const destination = source.mode === 'spellbook' ? 'spellbook' : source.mode === 'known' ? 'known' : 'prepared';
      const alreadyPrepared = new Set(alwaysPrepared
        .filter((entry) => entry.sourceKey === source.key)
        .map((entry) => entry.spellIndex));
      pending.push({
        key: `${source.key}:${destination}`,
        source,
        name: source.mode === 'spellbook' ? `${source.name} Spellbook` : source.mode === 'known' ? `${source.name} Known Spells` : `${source.name} Prepared Spells`,
        subclassName: source.subclassName,
        kind: destination,
        destination,
        required: Math.max(0, source.spellLimit - (fixedCount.get(`${source.key}:${destination}`) ?? 0)),
        eligible: listSpells.filter((spell) => spell.level > 0
          && spell.level <= source.maxSpellLevel
          && (destination !== 'prepared' || !alreadyPrepared.has(spell.index))),
        countsAgainstLimit: true,
        granted: false,
        usesGlobalUniqueness: true,
      });
    }
  }

  const requirements: SpellSelectionRequirement[] = [];
  for (const item of pending) {
    const requirement = validateRequirement(item, choices, spellByIndex, acquisitionOwners);
    requirements.push(requirement);
    validationErrors.push(...requirement.errors);
    const target = item.destination === 'known' ? known : item.destination === 'spellbook' ? spellbook : item.destination === 'prepared' ? prepared : alwaysPrepared;
    for (const index of requirement.validSelectedSpellIndices) {
      addResolved(target, index, item.source, item.destination, item.granted, item.countsAgainstLimit, item.subclassName);
    }
  }

  for (const { context, source } of dependentGrants) {
    const grant = context.grant;
    const acquired = grant.fromDestination === 'known' ? known
      : grant.fromDestination === 'spellbook' ? spellbook
        : prepared;
    const acquiredIndexes = new Set(acquired
      .filter(entry => entry.sourceKey === source.key)
      .map(entry => entry.spellIndex));
    const item: PendingRequirement = {
      key: `${context.scope}:grant:${grant.key}`,
      source,
      name: grant.name,
      subclassName: context.subclassName,
      kind: 'bonus',
      destination: grant.destination,
      required: grant.choose!,
      eligible: input.spells.filter(spell => acquiredIndexes.has(spell.index) && eligibleForGrant(spell, grant, source)),
      countsAgainstLimit: grant.countsAgainstLimit ?? false,
      granted: true,
      usesGlobalUniqueness: false,
    };
    const requirement = validateRequirement(item, choices, spellByIndex, acquisitionOwners);
    requirements.push(requirement);
    validationErrors.push(...requirement.errors);
    const target = grant.destination === 'known' ? known
      : grant.destination === 'spellbook' ? spellbook
        : alwaysPrepared;
    for (const index of requirement.validSelectedSpellIndices) {
      addResolved(target, index, source, grant.destination, true, grant.countsAgainstLimit ?? false, context.subclassName);
    }
  }

  for (const source of sources.filter((candidate) => candidate.mode === 'spellbook' && candidate.preparedLimit > 0)) {
    const eligibleIndexes = new Set(spellbook.filter((entry) => entry.sourceKey === source.key).map((entry) => entry.spellIndex));
    for (const entry of alwaysPrepared.filter((candidate) => candidate.sourceKey === source.key)) {
      eligibleIndexes.delete(entry.spellIndex);
    }
    const item: PendingRequirement = {
      key: `${source.key}:prepared`,
      source,
      name: `${source.name} Prepared Spells`,
      subclassName: source.subclassName,
      kind: 'prepared',
      destination: 'prepared',
      required: Math.max(0, source.preparedLimit - alwaysPrepared.filter((entry) => entry.sourceKey === source.key && entry.countsAgainstLimit).length),
      eligible: input.spells.filter((spell) => eligibleIndexes.has(spell.index)),
      countsAgainstLimit: true,
      granted: false,
      usesGlobalUniqueness: false,
    };
    const requirement = validateRequirement(item, choices, spellByIndex, acquisitionOwners);
    requirements.push(requirement);
    validationErrors.push(...requirement.errors);
    for (const index of requirement.validSelectedSpellIndices) addResolved(prepared, index, source, 'prepared', false, true);
  }

  const uniquenessByRequirement = new Map(pending.map(item => [item.key, item.usesGlobalUniqueness]));
  for (const requirement of requirements) {
    if (!uniquenessByRequirement.get(requirement.key)) continue;
    for (const index of requirement.eligibleSpellIndices) {
      const owner = acquisitionOwners.get(index);
      if (!owner || owner.requirementKey === requirement.key) continue;
      requirement.unavailableSpellIndices.push(index);
      requirement.unavailableSpellSources[index] = owner.sourceName;
    }
  }

  for (const source of sources) {
    if (source.castingAbility || source.mode === 'granted' && ![...known, ...spellbook, ...alwaysPrepared]
      .some((entry) => entry.sourceKey === source.key)) continue;
    if (!validationErrors.some((error) => error.code === 'missing_casting_ability' && error.message.startsWith(source.name))) {
      validationErrors.push({ code: 'missing_casting_ability', message: `${source.name} needs a spellcasting ability choice.` });
    }
  }

  const activeRequirementKeys = new Set(requirements.map((requirement) => requirement.key));
  for (const [key, selected] of Object.entries(choices)) {
    if (activeRequirementKeys.has(key) || selected.length === 0) continue;
    const errors = selected.map<SpellValidationError>((index) => ({
      code: 'ineligible_spell',
      requirementKey: key,
      spellIndex: index,
      message: `${spellByIndex.get(index)?.name ?? index} no longer belongs to an active spellcasting source. Remove it or restore the class, subclass, or grant that provided it.`,
    }));
    requirements.push({
      key,
      sourceKey: 'unassigned',
      sourceName: 'Unassigned Spells',
      name: 'Selections from an inactive source',
      kind: 'bonus',
      destination: 'known',
      required: 0,
      selectedSpellIndices: [...selected],
      validSelectedSpellIndices: [],
      invalidSelectedSpellIndices: [...selected],
      eligibleSpellIndices: [],
      unavailableSpellIndices: [],
      unavailableSpellSources: {},
      remaining: 0,
      countsAgainstLimit: false,
      errors,
    });
    validationErrors.push(...errors);
  }

  const isComplete = requirements.every((requirement) => requirement.remaining === 0 && requirement.errors.length === 0)
    && validationErrors.length === 0;
  return {
    sources: sources.map(publicSource),
    requirements,
    known,
    spellbook,
    prepared,
    alwaysPrepared,
    slotPools: slotPools(sources),
    validationErrors,
    isComplete,
  };
}
