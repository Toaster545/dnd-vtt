import { describe, expect, it } from 'vitest';
import { TraitEffect } from '../services/content.service';
import { unarmoredDefenseBonus } from './character-effects';

describe('unarmoredDefenseBonus', () => {
  it('adds the modifier named by an active Unarmored Defense effect', () => {
    const effects: TraitEffect[] = [
      { type: 'unarmored_defense', tags: ['constitution'], condition: 'no_armor' },
    ];
    expect(unarmoredDefenseBonus(effects, { constitution: 3 })).toBe(3);
  });

  it('preserves a negative modifier because the feature uses the real modifier', () => {
    const effects: TraitEffect[] = [
      { type: 'unarmored_defense', tags: ['constitution'], condition: 'no_armor' },
    ];
    expect(unarmoredDefenseBonus(effects, { constitution: -1 })).toBe(-1);
  });

  it('adds nothing without an active Unarmored Defense effect', () => {
    expect(unarmoredDefenseBonus([], { constitution: 4 })).toBe(0);
  });
});
