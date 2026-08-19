import { AVATAR_MANIFEST } from './avatar-manifest.generated';
import { CUSTOM_AVATAR_STYLES } from './custom-avatar-manifest.generated';

export interface AvatarRecipeV1 {
  schemaVersion: 1;
  styleId: string;
  styleVersion: number;
  seed: string;
  parts: Record<string, string[]>;
  colors: Record<string, string>;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_SEED = /^[a-zA-Z0-9_-]{1,64}$/;
type CategoryManifest = {
  min: number;
  max: number;
  parts: readonly string[];
  occupies?: Record<string, readonly string[]>;
  conflicts?: Record<string, readonly string[]>;
};
type StyleManifest = {
  version: number;
  categories: Record<string, CategoryManifest>;
  colors: readonly string[];
};
const STYLE_MANIFESTS: Record<string, StyleManifest> = {
  ...AVATAR_MANIFEST.styles,
  ...CUSTOM_AVATAR_STYLES,
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === allowed.length && keys.every((key) => allowed.includes(key))
  );
}

export function parseAvatarRecipe(value: unknown): AvatarRecipeV1 | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }
  if (
    !serialized ||
    Buffer.byteLength(serialized, 'utf8') > AVATAR_MANIFEST.maxSerializedBytes
  ) {
    return null;
  }

  const input = record(value);
  if (
    !input ||
    !exactKeys(input, [
      'schemaVersion',
      'styleId',
      'styleVersion',
      'seed',
      'parts',
      'colors',
    ])
  ) {
    return null;
  }
  if (
    input.schemaVersion !== 1 ||
    typeof input.styleId !== 'string' ||
    typeof input.styleVersion !== 'number'
  )
    return null;
  const style = STYLE_MANIFESTS[input.styleId];
  if (!style || style.version !== input.styleVersion) return null;
  if (typeof input.seed !== 'string' || !SAFE_SEED.test(input.seed))
    return null;

  const rawParts = record(input.parts);
  const categoryIds = Object.keys(style.categories);
  if (
    !rawParts ||
    !Object.keys(rawParts).every((key) => categoryIds.includes(key))
  )
    return null;
  const parts: Record<string, string[]> = {};
  for (const categoryId of categoryIds) {
    const category = style.categories[categoryId];
    const rawSelection = rawParts[categoryId];
    const selection =
      rawSelection === undefined && category.min === 0 ? [] : rawSelection;
    if (
      !Array.isArray(selection) ||
      selection.length < category.min ||
      selection.length > category.max
    ) {
      return null;
    }
    if (
      !selection.every(
        (part): part is string =>
          typeof part === 'string' && category.parts.includes(part),
      )
    ) {
      return null;
    }
    if (new Set(selection).size !== selection.length) return null;
    const occupied = new Set<string>();
    for (const part of selection) {
      const slots = category.occupies?.[part] ?? [];
      if (slots.some((slot) => occupied.has(slot))) return null;
      for (const slot of slots) occupied.add(slot);
      if (
        (category.conflicts?.[part] ?? []).some((conflict) =>
          selection.includes(conflict),
        )
      )
        return null;
    }
    parts[categoryId] = [...selection];
  }

  const rawColors = record(input.colors);
  if (!rawColors || !exactKeys(rawColors, style.colors)) return null;
  const colors: Record<string, string> = {};
  for (const colorId of style.colors) {
    const color = rawColors[colorId];
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) return null;
    colors[colorId] = color.toLowerCase();
  }

  return {
    schemaVersion: 1,
    styleId: input.styleId,
    styleVersion: style.version,
    seed: input.seed,
    parts,
    colors,
  };
}
