import { describe, expect, it } from 'vitest';
import { resolveProgressiveChoiceLimit } from './progressive-choice';

describe('resolveProgressiveChoiceLimit', () => {
  const warlockInvocations = {
    '1': 1,
    '2': 3,
    '5': 5,
    '7': 6,
    '9': 7,
    '12': 8,
    '15': 9,
    '18': 10,
  };

  it.each([
    [1, 1],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 5],
    [6, 5],
    [7, 6],
    [8, 6],
    [9, 7],
    [11, 7],
    [12, 8],
    [14, 8],
    [15, 9],
    [17, 9],
    [18, 10],
    [20, 10],
  ])('at Warlock level %i allows %i invocation choices', (level, expected) => {
    expect(resolveProgressiveChoiceLimit(1, warlockInvocations, level)).toBe(expected);
  });

  it('uses the ordinary choice limit when no progression exists', () => {
    expect(resolveProgressiveChoiceLimit(3, undefined, 20)).toBe(3);
  });
});
