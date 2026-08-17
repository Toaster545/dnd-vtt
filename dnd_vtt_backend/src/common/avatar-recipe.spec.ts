import { parseAvatarRecipe } from './avatar-recipe';

function validRecipe() {
  return {
    schemaVersion: 1,
    styleId: 'lorelei',
    styleVersion: 1,
    seed: 'safe-seed',
    parts: {
      face: ['variant01'],
      eyes: ['variant01'],
      eyebrows: ['variant01'],
      nose: ['variant01'],
      mouth: ['happy01'],
      hair: ['variant01'],
      facialHair: [],
      faceDetails: [],
      piercings: [],
      accessories: [],
    },
    colors: {
      skin: '#FFFFFF',
      hair: '#000000',
      eyes: '#000000',
      eyebrows: '#000000',
      mouth: '#000000',
      details: '#000000',
      piercings: '#000000',
      accessories: '#000000',
    },
  };
}

describe('parseAvatarRecipe', () => {
  it('accepts and normalizes a complete catalog-backed recipe', () => {
    expect(parseAvatarRecipe(validRecipe())).toMatchObject({
      styleId: 'lorelei',
      seed: 'safe-seed',
      parts: { ears: [], horns: [], scars: [], tattoos: [] },
      colors: { skin: '#ffffff' },
    });
  });

  it.each([
    [
      'unknown option',
      () => ({
        ...validRecipe(),
        parts: { ...validRecipe().parts, face: ['missing'] },
      }),
    ],
    [
      'invalid color',
      () => ({
        ...validRecipe(),
        colors: { ...validRecipe().colors, skin: 'red' },
      }),
    ],
    ['extra key', () => ({ ...validRecipe(), rawSvg: '<script />' })],
    [
      'unknown category',
      () => ({
        ...validRecipe(),
        parts: { ...validRecipe().parts, scripts: [] },
      }),
    ],
    [
      'too many selections',
      () => ({
        ...validRecipe(),
        parts: {
          ...validRecipe().parts,
          faceDetails: ['freckles', 'freckles'],
        },
      }),
    ],
    [
      'conflicting glasses',
      () => ({
        ...validRecipe(),
        parts: {
          ...validRecipe().parts,
          accessories: ['glasses:variant01', 'glasses:variant02'],
        },
      }),
    ],
  ])('rejects %s', (_label, build) => {
    expect(parseAvatarRecipe(build())).toBeNull();
  });

  it('rejects oversized recipes', () => {
    expect(
      parseAvatarRecipe({ ...validRecipe(), seed: 'x'.repeat(9000) }),
    ).toBeNull();
  });
});
