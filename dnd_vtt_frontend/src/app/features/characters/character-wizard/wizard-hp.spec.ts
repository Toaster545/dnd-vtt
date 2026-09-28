import { describe, expect, it } from 'vitest';
import { carriedCurrentHp } from './wizard-hp';

describe('carriedCurrentHp', () => {
  it('starts a new character at full HP', () => {
    expect(carriedCurrentHp(null, null, 12)).toBe(12);
  });

  it('adds any max HP gained since load to current HP', () => {
    // Wounded 14/20 character levels up to a 27 max: +7 max, +7 current.
    expect(carriedCurrentHp(14, 20, 27)).toBe(21);
  });

  it('keeps the gain across repeated saves by always measuring from the loaded baseline', () => {
    // Each autosave recomputes from the same loaded 14/20, so intermediate values while typing
    // (2, then 27) can't lose or double the gain.
    expect(carriedCurrentHp(14, 20, 2)).toBe(2);
    expect(carriedCurrentHp(14, 20, 27)).toBe(21);
    expect(carriedCurrentHp(14, 20, 27)).toBe(21);
  });

  it('never leaves current HP above a lowered max', () => {
    expect(carriedCurrentHp(18, 20, 15)).toBe(15);
    expect(carriedCurrentHp(10, 20, 15)).toBe(10);
  });
});
