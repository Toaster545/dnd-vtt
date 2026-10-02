import { moveCost } from './movement';

describe('moveCost', () => {
  const origin = { x: 0, y: 0 };

  it('charges 5 ft per orthogonal square', () => {
    expect(moveCost(origin, { x: 0, y: 4 }, 0)).toEqual({
      feet: 20,
      diagonals: 0,
    });
  });

  it('alternates 5/10 ft on diagonals', () => {
    expect(moveCost(origin, { x: 3, y: 3 }, 0)).toEqual({
      feet: 20,
      diagonals: 3,
    });
  });

  it('continues the diagonal count from earlier moves this turn', () => {
    const first = moveCost(origin, { x: 1, y: 1 }, 0);
    const second = moveCost({ x: 1, y: 1 }, { x: 2, y: 2 }, first.diagonals);
    expect(first.feet + second.feet).toBe(15);
  });

  it('mixes straight and diagonal steps', () => {
    expect(moveCost(origin, { x: 4, y: 1 }, 0).feet).toBe(20);
  });
});
