import {
  parseWikiLinks,
  rewriteWikiLinks,
  slugify,
  wikiLinkSlugs,
} from './wikilink.util';

describe('slugify', () => {
  it('lowercases, dashes spaces, strips punctuation', () => {
    expect(slugify('The Sunless Citadel!')).toBe('the-sunless-citadel');
  });

  it('strips accents and collapses dashes', () => {
    expect(slugify('  Château   d’If  ')).toBe('chateau-dif');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('--Elara--')).toBe('elara');
  });
});

describe('parseWikiLinks', () => {
  it('parses a bare link', () => {
    expect(parseWikiLinks('see [[Elara]] now')).toEqual([
      { raw: '[[Elara]]', target: 'Elara', slug: 'elara' },
    ]);
  });

  it('splits alias and heading', () => {
    const [link] = parseWikiLinks('[[Elara Moonwhisper#Backstory|the elf]]');
    expect(link).toMatchObject({
      target: 'Elara Moonwhisper',
      slug: 'elara-moonwhisper',
      heading: 'Backstory',
      alias: 'the elf',
    });
  });

  it('ignores empty targets', () => {
    expect(parseWikiLinks('[[]] [[   ]]')).toEqual([]);
  });

  it('handles multiple links on a line', () => {
    expect(parseWikiLinks('[[A]] and [[B]]').map((l) => l.slug)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('wikiLinkSlugs', () => {
  it('dedupes while preserving first-seen order', () => {
    expect(wikiLinkSlugs('[[Alpha]] [[beta]] [[ALPHA]]')).toEqual([
      'alpha',
      'beta',
    ]);
  });
});

describe('rewriteWikiLinks', () => {
  it('rewrites a bare link, keeping heading and alias', () => {
    const body = 'meet [[Old Name#Bio|him]] and [[Old Name]]';
    expect(rewriteWikiLinks(body, 'Old Name', 'New Name')).toBe(
      'meet [[New Name#Bio|him]] and [[New Name]]',
    );
  });

  it('matches the slugified form too', () => {
    expect(rewriteWikiLinks('[[old-name]]', 'Old Name', 'New Name')).toBe(
      '[[New Name]]',
    );
  });

  it('leaves unrelated links alone', () => {
    expect(rewriteWikiLinks('[[Someone Else]]', 'Old Name', 'New Name')).toBe(
      '[[Someone Else]]',
    );
  });
});
