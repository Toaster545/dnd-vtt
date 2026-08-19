import { AvatarRecipeV1, AvatarStyleDefinition } from '../models/avatar.model';

export const AVATAR_LAYER_ORDER = [
  'hairBack',
  'face',
  'tattoos',
  'details',
  'eyes',
  'eyebrows',
  'nose',
  'mouth',
  'facialHair',
  'hairFront',
  'piercings',
  'accessories',
  'foreground',
] as const;

export interface LayeredAvatarPack {
  definition: AvatarStyleDefinition & { viewBox: string };
  assets: Record<
    string,
    Record<string, Partial<Record<(typeof AVATAR_LAYER_ORDER)[number], string>>>
  >;
}

const TOKEN = /__AVATAR_COLOR_([a-z][a-z0-9_-]{0,63})__/g;

export function renderLayeredAvatar(recipe: AvatarRecipeV1, pack: LayeredAvatarPack): string {
  const body: string[] = [];
  for (const layer of AVATAR_LAYER_ORDER) {
    for (const category of pack.definition.categories) {
      for (const partId of recipe.parts[category.id] ?? []) {
        const fragment = pack.assets[category.id]?.[partId]?.[layer];
        if (!fragment) continue;
        body.push(
          fragment.replace(TOKEN, (_, colorId: string) => {
            const color = recipe.colors[colorId];
            return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
              ? color.toLowerCase()
              : '#000000';
          }),
        );
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${pack.definition.viewBox}">${body.join('')}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
