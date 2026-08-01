import { adjustCurrency } from './currency';

const empty = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

describe('adjustCurrency', () => {
  it('adds coins directly with no borrowing needed', () => {
    expect(adjustCurrency(empty, 'gp', 5)).toEqual({ ...empty, gp: 5 });
  });

  it('removes coins directly when enough of that denomination is on hand', () => {
    expect(adjustCurrency({ ...empty, sp: 5 }, 'sp', -2)).toEqual({ ...empty, sp: 3 });
  });

  it('breaks a gold piece into silver when removing more silver than is on hand', () => {
    expect(adjustCurrency({ ...empty, gp: 1 }, 'sp', -2)).toEqual({ ...empty, gp: 0, sp: 8 });
  });

  it('cascades through multiple denominations when the nearest one is also short', () => {
    // 1 pp on hand, no gp/sp — withdrawing 5 sp should break the pp all the way down.
    expect(adjustCurrency({ ...empty, pp: 1 }, 'sp', -5)).toEqual({ ...empty, pp: 0, gp: 9, sp: 5 });
  });

  it('skips empty denominations while borrowing', () => {
    // ep is empty, so the borrow for sp should skip straight to gp.
    expect(adjustCurrency({ ...empty, gp: 2 }, 'sp', -3)).toEqual({ ...empty, gp: 1, sp: 7 });
  });

  it('borrows from multiple coins of the same higher denomination if one is not enough', () => {
    expect(adjustCurrency({ ...empty, gp: 3 }, 'sp', -25)).toEqual({ ...empty, gp: 0, sp: 5 });
  });

  it('returns null when the purse cannot cover the withdrawal', () => {
    expect(adjustCurrency({ ...empty, sp: 1 }, 'gp', -1)).toBeNull();
  });

  it('leaves the purse unchanged when the delta is zero', () => {
    expect(adjustCurrency({ ...empty, gp: 4 }, 'gp', 0)).toEqual({ ...empty, gp: 4 });
  });
});
