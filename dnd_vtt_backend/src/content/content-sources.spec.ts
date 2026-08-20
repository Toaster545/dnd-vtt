import {
  DEFAULT_PLAYER_SOURCES,
  disallowedSources,
  normalizePlayerSources,
  sourceReference,
} from './content-sources';

describe('content sources', () => {
  it('defaults to PHB and includes required dependencies', () => {
    expect(normalizePlayerSources(undefined)).toEqual(DEFAULT_PLAYER_SOURCES);
    expect(normalizePlayerSources(['EFA'])).toEqual(['XPHB', 'EFA']);
    expect(normalizePlayerSources(['XGE'])).toEqual(['XPHB', 'XGE']);
    expect(normalizePlayerSources(['TCE'])).toEqual(['XPHB', 'TCE']);
  });

  it('ignores non-player and unknown sources in character policies', () => {
    expect(normalizePlayerSources(['HOMEBREW', 'XMM', 'UNKNOWN'])).toEqual([
      'XPHB',
    ]);
  });

  it('reports enabled sources that a campaign disallows', () => {
    expect(disallowedSources(['XPHB', 'EFA'], ['XPHB'])).toEqual(['EFA']);
    expect(sourceReference('EFA').book).toBe('Eberron: Forge of the Artificer');
    expect(sourceReference('XGE').book).toBe("Xanathar's Guide to Everything");
    expect(sourceReference('TCE').book).toBe("Tasha's Cauldron of Everything");
  });
});
