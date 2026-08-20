export interface ContentSourceDefinition {
  code: string;
  name: string;
  short_name: string;
  edition: number;
  description: string;
  default_enabled: boolean;
  locked: boolean;
  player_options: boolean;
  requires: string[];
}

export interface ContentSourceReference {
  code: string;
  book: string;
  edition: number;
}

export const PHB_SOURCE_CODE = 'XPHB';
export const EBERRON_SOURCE_CODE = 'EFA';
export const XANATHAR_SOURCE_CODE = 'XGE';
export const TASHA_SOURCE_CODE = 'TCE';
export const MONSTER_MANUAL_SOURCE_CODE = 'XMM';
export const HOMEBREW_SOURCE_CODE = 'HOMEBREW';

export const CONTENT_SOURCES: ContentSourceDefinition[] = [
  {
    code: PHB_SOURCE_CODE,
    name: "Player's Handbook",
    short_name: 'PHB 2024',
    edition: 2024,
    description: 'The base 2024 character options. Always available.',
    default_enabled: true,
    locked: true,
    player_options: true,
    requires: [],
  },
  {
    code: EBERRON_SOURCE_CODE,
    name: 'Eberron: Forge of the Artificer',
    short_name: 'Eberron',
    edition: 2024,
    description:
      'Adds the Artificer, its subclasses, Homunculus Servant, and Eberron character options.',
    default_enabled: false,
    locked: false,
    player_options: true,
    requires: [PHB_SOURCE_CODE],
  },
  {
    code: XANATHAR_SOURCE_CODE,
    name: "Xanathar's Guide to Everything",
    short_name: "Xanathar's Guide",
    edition: 2017,
    description:
      "Adds legacy subclasses, racial feats, spells, and common magic items from Xanathar's Guide to Everything.",
    default_enabled: false,
    locked: false,
    player_options: true,
    requires: [PHB_SOURCE_CODE],
  },
  {
    code: TASHA_SOURCE_CODE,
    name: "Tasha's Cauldron of Everything",
    short_name: "Tasha's Cauldron",
    edition: 2020,
    description:
      "Adds legacy subclasses, feats, spells, magic items, and summonable creatures from Tasha's Cauldron of Everything.",
    default_enabled: false,
    locked: false,
    player_options: true,
    requires: [PHB_SOURCE_CODE],
  },
  {
    code: MONSTER_MANUAL_SOURCE_CODE,
    name: 'Monster Manual',
    short_name: 'MM 2024',
    edition: 2024,
    description: 'The core bestiary used for encounters and monster reference.',
    default_enabled: false,
    locked: false,
    player_options: false,
    requires: [],
  },
  {
    code: HOMEBREW_SOURCE_CODE,
    name: 'Homebrew',
    short_name: 'Homebrew',
    edition: 0,
    description: 'Content created by a Dungeon Master.',
    default_enabled: false,
    locked: false,
    player_options: false,
    requires: [],
  },
];

const sourceByCode = new Map(
  CONTENT_SOURCES.map((source) => [source.code, source]),
);

export const DEFAULT_PLAYER_SOURCES = CONTENT_SOURCES.filter(
  (source) =>
    source.player_options && (source.default_enabled || source.locked),
).map((source) => source.code);

export function sourceDefinition(code: string) {
  return sourceByCode.get(code);
}

export function sourceReference(code: string): ContentSourceReference {
  const source = sourceDefinition(code) ?? sourceDefinition(PHB_SOURCE_CODE)!;
  return { code: source.code, book: source.name, edition: source.edition };
}

export function normalizePlayerSources(value: unknown): string[] {
  const requested = Array.isArray(value)
    ? value.filter(
        (code): code is string =>
          typeof code === 'string' &&
          sourceDefinition(code)?.player_options === true,
      )
    : [];
  const result = new Set([...DEFAULT_PLAYER_SOURCES, ...requested]);
  for (const code of [...result]) {
    for (const required of sourceDefinition(code)?.requires ?? []) {
      result.add(required);
    }
  }
  return CONTENT_SOURCES.filter((source) => result.has(source.code)).map(
    (source) => source.code,
  );
}

export function sourceName(code: string): string {
  return sourceDefinition(code)?.name ?? code;
}

export function disallowedSources(
  enabledSources: unknown,
  allowedSources: unknown,
): string[] {
  const enabled = normalizePlayerSources(enabledSources);
  const allowed = new Set(normalizePlayerSources(allowedSources));
  return enabled.filter((code) => !allowed.has(code));
}
