import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';
import { renderLayeredAvatar } from '../avatar/layered-avatar';
import {
  avatarRecipeKey,
  legacySeedToAvatarRecipe,
  normalizeAvatarRecipe,
  portraitDataUri,
  portraitSource,
  randomAvatarRecipe,
} from './avatar';

describe('avatar recipes', () => {
  it('keeps legacy seed rendering on the original DiceBear path', () => {
    const seed = 'legacy-character';
    expect(portraitDataUri(portraitSource(seed))).toBe(createAvatar(lorelei, { seed }).toDataUri());
  });

  it('derives explicit Lorelei choices without visually changing the seed portrait', () => {
    const seed = 'convert-me';
    const recipe = legacySeedToAvatarRecipe(seed);
    expect(portraitDataUri(portraitSource(seed, recipe))).toBe(
      createAvatar(lorelei, { seed }).toDataUri(),
    );
  });

  it('normalizes colors, unknown parts, and conflicting accessory slots', () => {
    const recipe = randomAvatarRecipe('normalization');
    const normalized = normalizeAvatarRecipe({
      ...recipe,
      parts: {
        ...recipe.parts,
        face: ['unknown'],
        accessories: ['glasses:variant01', 'glasses:variant02', 'hair:flowers'],
      },
      colors: { ...recipe.colors, skin: '#ABCDEF', hair: 'url(bad)' },
    });

    expect(normalized?.parts['face']).toEqual(['variant01']);
    expect(normalized?.parts['accessories']).toEqual(['glasses:variant01', 'hair:flowers']);
    expect(normalized?.colors['skin']).toBe('#abcdef');
    expect(normalized?.colors['hair']).toBe('#000000');
  });

  it('randomizes deterministically for a supplied seed and canonicalizes keys', () => {
    const first = randomAvatarRecipe('same-seed');
    const second = randomAvatarRecipe('same-seed');
    expect(second).toEqual(first);
    expect(avatarRecipeKey(second)).toBe(avatarRecipeKey(first));
    expect(portraitDataUri(portraitSource('fallback', first))).toBe(
      portraitDataUri(portraitSource('fallback', second)),
    );
  });

  it('rejects unknown styles and malformed seeds', () => {
    const recipe = randomAvatarRecipe('valid');
    expect(normalizeAvatarRecipe({ ...recipe, styleId: 'missing' })).toBeNull();
    expect(normalizeAvatarRecipe({ ...recipe, seed: '<script>' })).toBeNull();
  });

  it('renders custom SVG fragments in fixed layer order with validated color tokens', () => {
    const recipe = {
      schemaVersion: 1 as const,
      styleId: 'test',
      styleVersion: 1,
      seed: 'test',
      parts: { face: ['round'], hair: ['short'] },
      colors: { skin: '#abcdef', hair: '#123456' },
    };
    const uri = renderLayeredAvatar(recipe, {
      definition: {
        id: 'test',
        version: 1,
        label: 'Test',
        viewBox: '0 0 10 10',
        categories: [
          {
            id: 'face',
            label: 'Face',
            minSelections: 1,
            maxSelections: 1,
            parts: [{ id: 'round', label: 'Round' }],
          },
          {
            id: 'hair',
            label: 'Hair',
            minSelections: 1,
            maxSelections: 1,
            parts: [{ id: 'short', label: 'Short' }],
          },
        ],
        colors: [],
      },
      assets: {
        face: { round: { face: '<path id="face" fill="__AVATAR_COLOR_skin__" />' } },
        hair: {
          short: {
            hairBack: '<path id="back" fill="__AVATAR_COLOR_hair__" />',
            hairFront: '<path id="front" fill="__AVATAR_COLOR_hair__" />',
          },
        },
      },
    });
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length));
    expect(svg.indexOf('id="back"')).toBeLessThan(svg.indexOf('id="face"'));
    expect(svg.indexOf('id="face"')).toBeLessThan(svg.indexOf('id="front"'));
    expect(svg).toContain('fill="#abcdef"');
  });
});
