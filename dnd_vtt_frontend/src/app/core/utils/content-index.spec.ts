import { toContentIndex } from './content-index';

describe('toContentIndex', () => {
  it('lowercases and hyphenates', () => {
    expect(toContentIndex('Fire Bolt')).toBe('fire-bolt');
    expect(toContentIndex('Half  Elf')).toBe('half-elf');
    expect(toContentIndex('fighter')).toBe('fighter');
  });
});
