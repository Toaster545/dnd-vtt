// Generated from avatar-assets/packs/lorelei/catalog.json. Do not edit by hand.
export const AVATAR_MANIFEST = {
  maxSerializedBytes: 8192,
  styles: {
    lorelei: {
      version: 1,
      categories: {
        face: {
          min: 1,
          max: 1,
          parts: ['variant01', 'variant02', 'variant03', 'variant04'],
        },
        ears: { min: 0, max: 1, parts: [] },
        eyes: {
          min: 1,
          max: 1,
          parts: Array.from(
            { length: 24 },
            (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
          ),
        },
        eyebrows: {
          min: 1,
          max: 1,
          parts: Array.from(
            { length: 13 },
            (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
          ),
        },
        nose: {
          min: 1,
          max: 1,
          parts: Array.from(
            { length: 6 },
            (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
          ),
        },
        mouth: {
          min: 1,
          max: 1,
          parts: [
            ...Array.from(
              { length: 18 },
              (_, i) => `happy${String(i + 1).padStart(2, '0')}`,
            ),
            ...Array.from(
              { length: 9 },
              (_, i) => `sad${String(i + 1).padStart(2, '0')}`,
            ),
          ],
        },
        hair: {
          min: 1,
          max: 1,
          parts: Array.from(
            { length: 48 },
            (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
          ),
        },
        horns: { min: 0, max: 1, parts: [] },
        facialHair: { min: 0, max: 1, parts: ['variant01', 'variant02'] },
        faceDetails: { min: 0, max: 1, parts: ['freckles'] },
        scars: { min: 0, max: 3, parts: [] },
        tattoos: { min: 0, max: 2, parts: [] },
        piercings: {
          min: 0,
          max: 1,
          parts: ['variant01', 'variant02', 'variant03'],
        },
        accessories: {
          min: 0,
          max: 2,
          parts: [
            'glasses:variant01',
            'glasses:variant02',
            'glasses:variant03',
            'glasses:variant04',
            'glasses:variant05',
            'hair:flowers',
          ],
          occupies: {
            'glasses:variant01': ['eyes'],
            'glasses:variant02': ['eyes'],
            'glasses:variant03': ['eyes'],
            'glasses:variant04': ['eyes'],
            'glasses:variant05': ['eyes'],
            'hair:flowers': ['hair'],
          },
        },
      },
      colors: [
        'skin',
        'hair',
        'eyes',
        'eyebrows',
        'mouth',
        'details',
        'piercings',
        'accessories',
      ],
    },
  },
} as const;
