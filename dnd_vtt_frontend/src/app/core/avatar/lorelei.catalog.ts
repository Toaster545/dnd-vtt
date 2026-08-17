import { AvatarCategoryDefinition, AvatarStyleDefinition } from '../models/avatar.model';

function numberedParts(prefix: string, count: number, digits = 2) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      id: `${prefix}${String(number).padStart(digits, '0')}`,
      label: `${number}`,
    };
  });
}

function category(
  id: string,
  label: string,
  parts: AvatarCategoryDefinition['parts'],
  minSelections = 1,
  maxSelections = 1,
  noneWeight?: number,
): AvatarCategoryDefinition {
  return { id, label, parts, minSelections, maxSelections, noneWeight };
}

const SKIN_COLORS = [
  '#fff0e6',
  '#f7d7c4',
  '#eebda0',
  '#d89a72',
  '#b96f4f',
  '#8c4f36',
  '#5c3326',
  '#9fcf8f',
  '#7fb9d8',
  '#a99ad7',
  '#c98fb7',
  '#b8b8b8',
];

const HAIR_COLORS = [
  '#17120f',
  '#38251c',
  '#68432c',
  '#9a6038',
  '#d09a5b',
  '#ead39c',
  '#a83c32',
  '#6f778c',
  '#e8e8e8',
  '#6948a8',
  '#2d7f87',
  '#b84f91',
];

const EYE_COLORS = [
  '#2f2118',
  '#5c3b22',
  '#7b632a',
  '#39704e',
  '#32809b',
  '#4169a1',
  '#68509a',
  '#a13f47',
];

const ACCENT_COLORS = [
  '#17120f',
  '#f0e6cf',
  '#c9a227',
  '#b87333',
  '#a9b4c2',
  '#8b1a1a',
  '#2f6f5e',
  '#3d5f9e',
  '#75439b',
  '#bd4d8e',
];

export const LORELEI_STYLE: AvatarStyleDefinition = {
  id: 'lorelei',
  version: 1,
  label: 'Lorelei',
  categories: [
    category('face', 'Face', numberedParts('variant', 4)),
    category('ears', 'Ears', [], 0, 1),
    category('eyes', 'Eyes', numberedParts('variant', 24)),
    category('eyebrows', 'Eyebrows', numberedParts('variant', 13)),
    category('nose', 'Nose', numberedParts('variant', 6)),
    category('mouth', 'Mouth', [...numberedParts('happy', 18), ...numberedParts('sad', 9)]),
    category('hair', 'Hair', numberedParts('variant', 48)),
    category('horns', 'Horns', [], 0, 1),
    category('facialHair', 'Facial Hair', numberedParts('variant', 2), 0, 1, 2),
    category('faceDetails', 'Face Details', [{ id: 'freckles', label: 'Freckles' }], 0, 1, 2),
    category('scars', 'Scars', [], 0, 3),
    category('tattoos', 'Tattoos', [], 0, 2),
    category('piercings', 'Piercings', numberedParts('variant', 3), 0, 1, 2),
    category(
      'accessories',
      'Accessories',
      [
        ...numberedParts('variant', 5).map((part) => ({
          ...part,
          id: `glasses:${part.id}`,
          occupies: ['eyes'],
        })),
        { id: 'hair:flowers', label: 'Hair Flowers', occupies: ['hair'] },
      ],
      0,
      2,
      2,
    ),
  ],
  colors: [
    { id: 'skin', label: 'Skin', default: '#ffffff', palette: SKIN_COLORS },
    { id: 'hair', label: 'Hair', default: '#000000', palette: HAIR_COLORS },
    { id: 'eyes', label: 'Eyes', default: '#000000', palette: EYE_COLORS },
    { id: 'eyebrows', label: 'Eyebrows', default: '#000000', palette: HAIR_COLORS },
    {
      id: 'mouth',
      label: 'Mouth',
      default: '#000000',
      palette: ['#000000', '#7d2731', '#a84b55', '#d47b83'],
    },
    { id: 'details', label: 'Details', default: '#000000', palette: ACCENT_COLORS },
    { id: 'piercings', label: 'Piercings', default: '#000000', palette: ACCENT_COLORS },
    { id: 'accessories', label: 'Accessories', default: '#000000', palette: ACCENT_COLORS },
  ],
};

export const AVATAR_STYLES = [LORELEI_STYLE] as const;
