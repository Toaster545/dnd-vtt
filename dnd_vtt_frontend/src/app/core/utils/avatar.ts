import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';
import { LORELEI_STYLE } from '../avatar/lorelei.catalog';
import { GENERATED_LAYERED_AVATAR_PACKS } from '../avatar/custom-avatar-assets.generated';
import { LayeredAvatarPack, renderLayeredAvatar } from '../avatar/layered-avatar';
import { AvatarStyleDefinition } from '../models/avatar.model';
import { AvatarRecipeV1, PortraitSource } from '../models/avatar.model';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const URI_CACHE_LIMIT = 256;
const uriCache = new Map<string, string>();
const layeredPacks = GENERATED_LAYERED_AVATAR_PACKS as unknown as readonly LayeredAvatarPack[];
export const AVATAR_STYLE_DEFINITIONS: readonly AvatarStyleDefinition[] = [
  LORELEI_STYLE,
  ...layeredPacks.map((pack) => pack.definition),
];

function layeredPackFor(styleId: string, version: number): LayeredAvatarPack | undefined {
  return layeredPacks.find(
    (pack) => pack.definition.id === styleId && pack.definition.version === version,
  );
}

function styleDefinitionFor(styleId: string, version: number): AvatarStyleDefinition | undefined {
  if (styleId === LORELEI_STYLE.id && version === LORELEI_STYLE.version) return LORELEI_STYLE;
  return layeredPackFor(styleId, version)?.definition;
}

function cacheGet(key: string): string | undefined {
  const value = uriCache.get(key);
  if (value === undefined) return undefined;
  uriCache.delete(key);
  uriCache.set(key, value);
  return value;
}

function cacheSet(key: string, value: string) {
  if (uriCache.has(key)) uriCache.delete(key);
  uriCache.set(key, value);
  while (uriCache.size > URI_CACHE_LIMIT) {
    const oldest = uriCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    uriCache.delete(oldest);
  }
}

function selected(recipe: AvatarRecipeV1, category: string): string[] {
  return recipe.parts[category] ?? [];
}

function first(recipe: AvatarRecipeV1, category: string): string | undefined {
  return selected(recipe, category)[0];
}

function diceBearColor(color: string): string {
  return color.slice(1);
}

function loreleiOptions(recipe: AvatarRecipeV1): lorelei.Options {
  const accessories = selected(recipe, 'accessories');
  const glasses = accessories.find((id) => id.startsWith('glasses:'))?.slice('glasses:'.length);
  const hairAccessory = accessories.includes('hair:flowers') ? 'flowers' : undefined;
  const facialHair = first(recipe, 'facialHair');
  const freckles = first(recipe, 'faceDetails');
  const earrings = first(recipe, 'piercings');

  return {
    hair: [first(recipe, 'hair')! as NonNullable<lorelei.Options['hair']>[number]],
    head: [first(recipe, 'face')! as NonNullable<lorelei.Options['head']>[number]],
    eyes: [first(recipe, 'eyes')! as NonNullable<lorelei.Options['eyes']>[number]],
    eyebrows: [first(recipe, 'eyebrows')! as NonNullable<lorelei.Options['eyebrows']>[number]],
    nose: [first(recipe, 'nose')! as NonNullable<lorelei.Options['nose']>[number]],
    mouth: [first(recipe, 'mouth')! as NonNullable<lorelei.Options['mouth']>[number]],
    beard: facialHair ? [facialHair as NonNullable<lorelei.Options['beard']>[number]] : undefined,
    beardProbability: facialHair ? 100 : 0,
    freckles: freckles ? ['variant01'] : undefined,
    frecklesProbability: freckles ? 100 : 0,
    earrings: earrings ? [earrings as NonNullable<lorelei.Options['earrings']>[number]] : undefined,
    earringsProbability: earrings ? 100 : 0,
    glasses: glasses ? [glasses as NonNullable<lorelei.Options['glasses']>[number]] : undefined,
    glassesProbability: glasses ? 100 : 0,
    hairAccessories: hairAccessory ? [hairAccessory] : undefined,
    hairAccessoriesProbability: hairAccessory ? 100 : 0,
    skinColor: [diceBearColor(recipe.colors['skin'])],
    hairColor: [diceBearColor(recipe.colors['hair'])],
    eyesColor: [diceBearColor(recipe.colors['eyes'])],
    eyebrowsColor: [diceBearColor(recipe.colors['eyebrows'])],
    mouthColor: [diceBearColor(recipe.colors['mouth'])],
    frecklesColor: [diceBearColor(recipe.colors['details'])],
    earringsColor: [diceBearColor(recipe.colors['piercings'])],
    glassesColor: [diceBearColor(recipe.colors['accessories'])],
    hairAccessoriesColor: [diceBearColor(recipe.colors['accessories'])],
  };
}

export function normalizeAvatarRecipe(value: unknown): AvatarRecipeV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    input['schemaVersion'] !== 1 ||
    typeof input['styleId'] !== 'string' ||
    typeof input['styleVersion'] !== 'number'
  )
    return null;
  const style = styleDefinitionFor(input['styleId'], input['styleVersion']);
  if (!style) return null;

  const rawParts = input['parts'];
  const partRecord =
    rawParts && typeof rawParts === 'object' && !Array.isArray(rawParts)
      ? (rawParts as Record<string, unknown>)
      : {};
  const parts: Record<string, string[]> = {};
  for (const category of style.categories) {
    const allowed = new Map(category.parts.map((part) => [part.id, part]));
    const raw: unknown[] = Array.isArray(partRecord[category.id])
      ? (partRecord[category.id] as unknown[])
      : [];
    const values: string[] = [];
    const occupied = new Set<string>();
    for (const candidate of raw) {
      if (typeof candidate !== 'string' || values.includes(candidate)) continue;
      const definition = allowed.get(candidate);
      if (!definition || definition.occupies?.some((slot) => occupied.has(slot))) continue;
      if (definition.conflictsWith?.some((id) => values.includes(id))) continue;
      values.push(candidate);
      for (const slot of definition.occupies ?? []) occupied.add(slot);
      if (values.length === category.maxSelections) break;
    }
    while (values.length < category.minSelections) {
      const fallback = category.parts.find((part) => !values.includes(part.id));
      if (!fallback) return null;
      values.push(fallback.id);
    }
    parts[category.id] = values;
  }

  const rawColors = input['colors'];
  const colorRecord =
    rawColors && typeof rawColors === 'object' && !Array.isArray(rawColors)
      ? (rawColors as Record<string, unknown>)
      : {};
  const colors: Record<string, string> = {};
  for (const definition of style.colors) {
    const candidate = colorRecord[definition.id];
    colors[definition.id] =
      typeof candidate === 'string' && HEX_COLOR.test(candidate)
        ? candidate.toLowerCase()
        : definition.default;
  }

  if (typeof input['seed'] !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input['seed']))
    return null;
  return {
    schemaVersion: 1,
    styleId: style.id,
    styleVersion: style.version,
    seed: input['seed'],
    parts,
    colors,
  };
}

export function avatarRecipeKey(recipe: AvatarRecipeV1): string {
  const normalized = normalizeAvatarRecipe(recipe);
  if (!normalized) return 'invalid';
  const style = styleDefinitionFor(normalized.styleId, normalized.styleVersion)!;
  const parts = style.categories.map((category) => [category.id, normalized.parts[category.id]]);
  const colors = style.colors.map((color) => [color.id, normalized.colors[color.id]]);
  return JSON.stringify([
    normalized.schemaVersion,
    normalized.styleId,
    normalized.styleVersion,
    normalized.seed,
    parts,
    colors,
  ]);
}

export function portraitSource(seed: string, recipe?: AvatarRecipeV1 | null): PortraitSource {
  const normalized = normalizeAvatarRecipe(recipe);
  return normalized
    ? { kind: 'recipe', recipe: normalized, fallbackSeed: seed }
    : { kind: 'legacy', seed };
}

export function portraitDataUri(source: string | PortraitSource): string {
  if (typeof source === 'string') return createAvatar(lorelei, { seed: source }).toDataUri();
  if (source.kind === 'legacy') return createAvatar(lorelei, { seed: source.seed }).toDataUri();
  const recipe = normalizeAvatarRecipe(source.recipe);
  if (!recipe) return createAvatar(lorelei, { seed: source.fallbackSeed }).toDataUri();
  const key = avatarRecipeKey(recipe);
  const cached = cacheGet(key);
  if (cached) return cached;
  const layeredPack = layeredPackFor(recipe.styleId, recipe.styleVersion);
  const uri = layeredPack
    ? renderLayeredAvatar(recipe, layeredPack)
    : createAvatar(lorelei, { seed: recipe.seed, ...loreleiOptions(recipe) }).toDataUri();
  cacheSet(key, uri);
  return uri;
}

export function randomPortraitSeed(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 10);
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T extends { weight?: number }>(
  values: readonly T[],
  random: () => number,
): T {
  const total = values.reduce((sum, value) => sum + (value.weight ?? 1), 0);
  let target = random() * total;
  for (const value of values) {
    target -= value.weight ?? 1;
    if (target <= 0) return value;
  }
  return values[values.length - 1];
}

function randomRecipeForStyle(style: AvatarStyleDefinition, seed: string): AvatarRecipeV1 {
  const random = seededRandom(seed);
  const parts: Record<string, string[]> = {};
  for (const category of style.categories) {
    const noneWeight = category.minSelections === 0 ? (category.noneWeight ?? 1) : 0;
    if (noneWeight && random() < noneWeight / (noneWeight + category.parts.length)) {
      parts[category.id] = [];
      continue;
    }
    const count =
      category.maxSelections > 1
        ? category.minSelections +
          Math.floor(random() * (category.maxSelections - category.minSelections + 1))
        : 1;
    const available = [...category.parts];
    const chosen: string[] = [];
    while (chosen.length < count && available.length) {
      const pick = weightedPick(available, random);
      chosen.push(pick.id);
      available.splice(available.indexOf(pick), 1);
    }
    parts[category.id] = chosen;
  }
  const colors = Object.fromEntries(
    style.colors.map((color) => [
      color.id,
      color.palette[Math.floor(random() * color.palette.length)] ?? color.default,
    ]),
  );
  return normalizeAvatarRecipe({
    schemaVersion: 1,
    styleId: style.id,
    styleVersion: style.version,
    seed,
    parts,
    colors,
  })!;
}

export function randomAvatarRecipe(seed = randomPortraitSeed()): AvatarRecipeV1 {
  return randomRecipeForStyle(LORELEI_STYLE, seed);
}

export function randomAvatarRecipeForStyle(
  styleId: string,
  styleVersion: number,
  seed = randomPortraitSeed(),
): AvatarRecipeV1 | null {
  const style = styleDefinitionFor(styleId, styleVersion);
  return style ? randomRecipeForStyle(style, seed) : null;
}

export function randomizeAvatarCategory(
  recipe: AvatarRecipeV1,
  categoryId: string,
): AvatarRecipeV1 {
  const normalized = normalizeAvatarRecipe(recipe) ?? randomAvatarRecipe();
  const style = styleDefinitionFor(normalized.styleId, normalized.styleVersion) ?? LORELEI_STYLE;
  const randomized = randomRecipeForStyle(style, randomPortraitSeed());
  if (!style.categories.some((category) => category.id === categoryId)) return normalized;
  return normalizeAvatarRecipe({
    ...normalized,
    seed: randomized.seed,
    parts: { ...normalized.parts, [categoryId]: randomized.parts[categoryId] },
  })!;
}

export function legacySeedToAvatarRecipe(seed: string): AvatarRecipeV1 {
  const extra = createAvatar(lorelei, { seed }).toJson().extra;
  const value = (key: string) =>
    typeof extra[key] === 'string' ? (extra[key] as string) : undefined;
  return normalizeAvatarRecipe({
    schemaVersion: 1,
    styleId: LORELEI_STYLE.id,
    styleVersion: 1,
    seed,
    parts: {
      face: value('head') ? [value('head')] : [],
      eyes: value('eyes') ? [value('eyes')] : [],
      eyebrows: value('eyebrows') ? [value('eyebrows')] : [],
      nose: value('nose') ? [value('nose')] : [],
      mouth: value('mouth') ? [value('mouth')] : [],
      hair: value('hair') ? [value('hair')] : [],
      facialHair: value('beard') ? [value('beard')] : [],
      faceDetails: value('freckles') ? ['freckles'] : [],
      piercings: value('earrings') ? [value('earrings')] : [],
      accessories: [
        ...(value('glasses') ? [`glasses:${value('glasses')}`] : []),
        ...(value('hairAccessories') ? [`hair:${value('hairAccessories')}`] : []),
      ],
    },
    colors: {
      skin: value('skinColor'),
      hair: value('hairColor'),
      eyes: value('eyesColor'),
      eyebrows: value('eyebrowsColor'),
      mouth: value('mouthColor'),
      details: value('frecklesColor'),
      piercings: value('earringsColor'),
      accessories: value('glassesColor') ?? value('hairAccessoriesColor'),
    },
  })!;
}

export function clearAvatarUriCache() {
  uriCache.clear();
}
