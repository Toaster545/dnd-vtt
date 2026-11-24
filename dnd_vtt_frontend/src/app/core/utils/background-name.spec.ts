import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_CUSTOM_NAME_KEY,
  BACKGROUND_CUSTOM_NAME_MAX_LENGTH,
  backgroundDisplayName,
  customBackgroundName,
  hasCustomBackgroundName,
} from './background-name';

describe('background name customization', () => {
  it('uses a character-local name while preserving the official base name separately', () => {
    const choices = { [BACKGROUND_CUSTOM_NAME_KEY]: ['Wandering Apothecary'] };

    expect(backgroundDisplayName('Sage', choices)).toBe('Wandering Apothecary');
    expect(customBackgroundName('Sage', choices)).toBe('Wandering Apothecary');
    expect(hasCustomBackgroundName('Sage', choices)).toBe(true);
  });

  it('falls back to the base name for blank, equivalent, or invalid values', () => {
    expect(backgroundDisplayName('Sage', { [BACKGROUND_CUSTOM_NAME_KEY]: ['   '] })).toBe('Sage');
    expect(backgroundDisplayName('Sage', { [BACKGROUND_CUSTOM_NAME_KEY]: ['sage'] })).toBe('Sage');
    expect(
      backgroundDisplayName('Sage', {
        [BACKGROUND_CUSTOM_NAME_KEY]: ['x'.repeat(BACKGROUND_CUSTOM_NAME_MAX_LENGTH + 1)],
      }),
    ).toBe('Sage');
  });
});
