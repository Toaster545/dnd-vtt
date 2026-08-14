import { buildSpellAccess, buildSpellLists } from './spell-access';

describe('provider-owned spell access', () => {
  const spells = [
    {
      index: 'spark',
      level: 0,
      school: 'Evocation',
      ritual: false,
      casting_time: '1 Action',
      mechanics: { spell_attacks: [] },
    },
    {
      index: 'ward',
      level: 1,
      school: 'Abjuration',
      ritual: true,
      casting_time: '1 Minute',
      mechanics: { spell_attacks: [] },
    },
  ];
  const classes = [
    {
      index: 'mage',
      name: 'Mage',
      source: { code: 'TEST' },
      spellcasting: { list: 'Mage', spells: ['spark', 'ward'] },
      levels: [
        {
          grants: [
            {
              type: 'spell_grant',
              name: 'Arcane Gift',
              spells: ['ward'],
            },
          ],
        },
      ],
      subclasses: [
        {
          index: 'spellblade',
          name: 'Spellblade',
          spellcasting: { list: 'Mage', spells: ['spark'] },
          levels: [
            {
              grants: [
                {
                  type: 'spell_grant',
                  name: 'Spellblade Ward',
                  spells: ['ward'],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  const races = [
    {
      index: 'starborn',
      name: 'Starborn',
      grants: [{ type: 'spell_grant', name: 'Starlight', spells: ['ward'] }],
      subraces: [
        {
          index: 'bright-starborn',
          name: 'Bright Starborn',
          grants: [
            {
              type: 'spell_grant',
              name: 'Bright Magic',
              choose: 1,
              filter: { lists: ['Mage'], exactLevels: [0] },
            },
          ],
        },
      ],
    },
  ];
  const backgrounds = [
    {
      index: 'student',
      name: 'Student',
      feature: 'Origin Feat: Ritual Student',
      grants: [
        { type: 'spell_grant', name: 'Student Magic', spells: ['spark'] },
      ],
    },
  ];
  const feats = [
    {
      index: 'ritual-student',
      name: 'Ritual Student',
      grants: [
        {
          type: 'spell_grant',
          name: 'Ritual Study',
          choose: 1,
          filter: {
            lists: ['Mage'],
            exactLevels: [1],
            ritual: true,
            castingTimes: ['Minute'],
          },
        },
      ],
    },
  ];

  it('builds named lists from the owning class definition', () => {
    expect(buildSpellLists(classes)).toEqual({ Mage: ['spark', 'ward'] });
  });

  it('derives reverse access for every provider kind and filtered choices', () => {
    const access = buildSpellAccess(spells, classes, races, backgrounds, feats);

    expect(access.get('spark')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'class', provider_name: 'Mage' }),
        expect.objectContaining({
          kind: 'subclass',
          provider_name: 'Spellblade',
        }),
        expect.objectContaining({
          kind: 'species',
          provider_name: 'Bright Starborn',
          mode: 'choice',
        }),
        expect.objectContaining({
          kind: 'background',
          provider_name: 'Student',
        }),
      ]),
    );
    expect(access.get('ward')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'class', provider_name: 'Mage' }),
        expect.objectContaining({
          kind: 'class_feature',
          provider_name: 'Arcane Gift',
        }),
        expect.objectContaining({
          kind: 'subclass',
          provider_name: 'Spellblade',
          detail: 'Spellblade Ward',
        }),
        expect.objectContaining({
          kind: 'species',
          provider_name: 'Starborn',
          detail: 'Starlight',
        }),
        expect.objectContaining({
          kind: 'feat',
          provider_name: 'Ritual Student',
          detail: 'Ritual Study',
          mode: 'choice',
        }),
        expect.objectContaining({
          kind: 'background',
          provider_name: 'Student',
          detail: 'Ritual Study',
          mode: 'choice',
        }),
      ]),
    );
  });
});
