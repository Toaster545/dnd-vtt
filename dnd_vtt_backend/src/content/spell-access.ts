export type SpellAccessKind =
  'class' | 'subclass' | 'species' | 'background' | 'feat' | 'class_feature';

export interface SpellAccessReference {
  kind: SpellAccessKind;
  provider_index: string;
  provider_name: string;
  parent_name?: string;
  detail?: string;
  source_code?: string;
  mode: 'list' | 'grant' | 'choice';
}

export type SpellListRegistry = Record<string, string[]>;

type ContentRecord = Record<string, unknown>;

type SpellGrant = ContentRecord & {
  type: 'spell_grant';
  key?: string;
  name?: string;
  spells?: string[];
  choose?: number;
  list?: string;
  fromDestination?: string;
  sourceKey?: string;
  sourceName?: string;
  filter?: {
    lists?: string[];
    schools?: string[];
    minLevel?: number;
    maxLevel?: number;
    exactLevels?: number[];
    ritual?: boolean;
    spellAttack?: boolean;
    castingTimes?: string[];
  };
};

function records(value: unknown): ContentRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is ContentRecord =>
          !!entry && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sourceCode(
  value: ContentRecord,
  fallback?: string,
): string | undefined {
  const source = value.source;
  if (!source || typeof source !== 'object') return fallback;
  return stringValue((source as ContentRecord).code) || fallback;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function identifier(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildSpellLists(classes: ContentRecord[]): SpellListRegistry {
  const lists: SpellListRegistry = {};
  for (const cls of classes) {
    const spellcasting = cls.spellcasting as ContentRecord | undefined;
    if (!spellcasting || !Array.isArray(spellcasting.spells)) continue;
    const name = stringValue(spellcasting.list) || stringValue(cls.name);
    if (!name) continue;
    lists[name] = [
      ...new Set(
        spellcasting.spells.filter(
          (spell): spell is string => typeof spell === 'string',
        ),
      ),
    ].sort();
  }
  return lists;
}

function matchingGrantSpells(
  grant: SpellGrant,
  spells: ContentRecord[],
  spellLists: SpellListRegistry,
): string[] {
  const indexes = new Set(Array.isArray(grant.spells) ? grant.spells : []);
  if (!(grant.choose ?? 0) || grant.fromDestination) return [...indexes];

  const filter = grant.filter ?? {};
  const listNames = filter.lists ?? (grant.list ? [grant.list] : []);
  const listIndexes = listNames.length
    ? new Set(listNames.flatMap((name) => spellLists[name] ?? []))
    : null;
  for (const spell of spells) {
    const index = stringValue(spell.index);
    const level = Number(spell.level);
    if (!index || (listIndexes && !listIndexes.has(index))) continue;
    if (
      filter.schools?.length &&
      !filter.schools.some(
        (school) => normalize(school) === normalize(stringValue(spell.school)),
      )
    )
      continue;
    if (filter.minLevel !== undefined && level < filter.minLevel) continue;
    if (filter.maxLevel !== undefined && level > filter.maxLevel) continue;
    if (filter.exactLevels?.length && !filter.exactLevels.includes(level))
      continue;
    if (filter.ritual !== undefined && Boolean(spell.ritual) !== filter.ritual)
      continue;
    const mechanics = (spell.mechanics ?? {}) as ContentRecord;
    if (
      filter.spellAttack &&
      (!Array.isArray(mechanics.spell_attacks) ||
        mechanics.spell_attacks.length === 0)
    )
      continue;
    if (filter.castingTimes?.length) {
      const castingTime = normalize(stringValue(spell.casting_time)).replace(
        /^1\s+/,
        '',
      );
      if (
        !filter.castingTimes.some(
          (time) => normalize(time).replace(/^1\s+/, '') === castingTime,
        )
      )
        continue;
    }
    indexes.add(index);
  }
  return [...indexes];
}

function visitSpellGrants(
  value: unknown,
  visit: (grant: SpellGrant, optionName?: string) => void,
  optionName?: string,
) {
  if (Array.isArray(value)) {
    for (const entry of value) visitSpellGrants(entry, visit, optionName);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as ContentRecord;
  if (record.type === 'spell_grant') {
    visit(record as SpellGrant, optionName);
    return;
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'options' && Array.isArray(child)) {
      for (const option of records(child)) {
        visitSpellGrants(option, visit, stringValue(option.name) || optionName);
      }
    } else {
      visitSpellGrants(child, visit, optionName);
    }
  }
}

export function buildSpellAccess(
  spells: ContentRecord[],
  classes: ContentRecord[],
  races: ContentRecord[],
  backgrounds: ContentRecord[],
  feats: ContentRecord[],
): Map<string, SpellAccessReference[]> {
  const access = new Map<string, SpellAccessReference[]>(
    spells.map((spell) => [String(spell.index), []]),
  );
  const spellLists = buildSpellLists(classes);

  const add = (spellIndex: string, reference: SpellAccessReference) => {
    const entries = access.get(spellIndex);
    if (!entries) return;
    const key = JSON.stringify(reference);
    if (!entries.some((entry) => JSON.stringify(entry) === key)) {
      entries.push(reference);
    }
  };

  const addList = (
    definition: ContentRecord | undefined,
    reference: Omit<SpellAccessReference, 'mode'>,
  ) => {
    if (!definition || !Array.isArray(definition.spells)) return;
    for (const index of definition.spells.map(String)) {
      add(index, { ...reference, mode: 'list' });
    }
  };

  const addGrants = (
    value: unknown,
    reference: Omit<SpellAccessReference, 'mode' | 'detail'>,
    include: (grant: SpellGrant) => boolean = () => true,
  ) => {
    visitSpellGrants(value, (grant, optionName) => {
      if (!include(grant)) return;
      const routeName = grant.sourceName || optionName || grant.name;
      const isClassFeature = reference.kind === 'class_feature';
      const providerName = isClassFeature
        ? routeName || reference.provider_name
        : reference.provider_name;
      const routeKey =
        grant.sourceKey ||
        optionName ||
        grant.key ||
        grant.name ||
        providerName;
      const providerIndex = isClassFeature
        ? `${reference.provider_index}:${identifier(routeKey)}`
        : reference.provider_index;
      const detail = isClassFeature
        ? grant.name && grant.name !== providerName
          ? grant.name
          : undefined
        : routeName && routeName !== providerName
          ? routeName
          : undefined;
      const mode = (grant.choose ?? 0) > 0 ? 'choice' : 'grant';
      for (const index of matchingGrantSpells(grant, spells, spellLists)) {
        add(index, {
          ...reference,
          provider_index: providerIndex,
          provider_name: providerName,
          ...(detail && detail !== providerName ? { detail } : {}),
          mode,
        });
      }
    });
  };

  for (const cls of classes) {
    const classIndex = String(cls.index);
    const className = String(cls.name);
    const classSource = sourceCode(cls);
    addList(cls.spellcasting as ContentRecord | undefined, {
      kind: 'class',
      provider_index: classIndex,
      provider_name: className,
      source_code: classSource,
    });
    addGrants(cls.levels, {
      kind: 'class_feature',
      provider_index: classIndex,
      provider_name: className,
      parent_name: className,
      source_code: classSource,
    });
    for (const subclass of records(cls.subclasses)) {
      const subclassIndex = String(subclass.index);
      const subclassName = String(subclass.name);
      const reference = {
        kind: 'subclass' as const,
        provider_index: `${classIndex}:${subclassIndex}`,
        provider_name: subclassName,
        parent_name: className,
        source_code: sourceCode(subclass, classSource),
      };
      addList(subclass.spellcasting as ContentRecord | undefined, reference);
      addGrants(subclass.levels, reference);
    }
  }

  for (const race of races) {
    const raceIndex = String(race.index);
    const raceName = String(race.name);
    const raceSource = sourceCode(race);
    addGrants(race.grants, {
      kind: 'species',
      provider_index: raceIndex,
      provider_name: raceName,
      source_code: raceSource,
    });
    for (const subrace of records(race.subraces)) {
      addGrants(subrace.grants, {
        kind: 'species',
        provider_index: `${raceIndex}:${String(subrace.index)}`,
        provider_name: String(subrace.name),
        parent_name: raceName,
        source_code: sourceCode(subrace, raceSource),
      });
    }
  }

  for (const background of backgrounds) {
    const reference = {
      kind: 'background',
      provider_index: String(background.index),
      provider_name: String(background.name),
      source_code: sourceCode(background),
    } as const;
    addGrants(background.grants, reference);

    const originFeat = /^Origin Feat:\s*(.+?)(?:\s*\(([^)]+)\))?$/i.exec(
      stringValue(background.feature),
    );
    if (!originFeat) continue;
    const feat = feats.find(
      (entry) =>
        normalize(stringValue(entry.name)) === normalize(originFeat[1]),
    );
    if (!feat) continue;
    const fixedList = originFeat[2];
    addGrants(feat.grants, reference, (grant) => {
      if (!fixedList) return true;
      const lists = grant.filter?.lists ?? (grant.list ? [grant.list] : []);
      return lists.some((list) => normalize(list) === normalize(fixedList));
    });
  }

  for (const feat of feats) {
    addGrants(feat.grants, {
      kind: 'feat',
      provider_index: String(feat.index),
      provider_name: String(feat.name),
      source_code: sourceCode(feat),
    });
  }

  for (const entries of access.values()) {
    entries.sort((a, b) =>
      `${a.kind}:${a.parent_name ?? ''}:${a.provider_name}:${a.detail ?? ''}`.localeCompare(
        `${b.kind}:${b.parent_name ?? ''}:${b.provider_name}:${b.detail ?? ''}`,
      ),
    );
  }
  return access;
}
