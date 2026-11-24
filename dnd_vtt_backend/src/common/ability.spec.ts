import { abilityModifier } from './ability';

describe('abilityModifier', () => {
  it.each([
    [10, 0],
    [8, -1],
    [9, -1],
    [15, 2],
    [1, -5],
    [20, 5],
  ])('score %i -> %i', (score, mod) => {
    expect(abilityModifier(score)).toBe(mod);
  });
});
