import { Currency } from '../models/character.model';

// Display order, low to high.
export const CURRENCY_ORDER: (keyof Currency)[] = ['cp', 'sp', 'ep', 'gp', 'pp'];

const CP_VALUE: Record<keyof Currency, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

// Which denomination gets broken to cover a shortfall in each one. Electrum sits off to the side
// of the standard cp/sp/gp/pp ladder — most 5e tables never touch it — so borrowing for sp breaks
// a gp directly (1 gp = 10 sp) rather than routing through ep; ep itself still converts against
// gp (1 gp = 2 ep) when it's the denomination actually being spent.
const LENDER: Partial<Record<keyof Currency, keyof Currency>> = { cp: 'sp', sp: 'gp', ep: 'gp', gp: 'pp' };

// Removes `amount` coins of `denom` value from the purse, breaking coins from `LENDER[denom]`
// (and, transitively, its own lender) as needed to cover a shortfall, and returning the leftover
// change to `denom`. Returns null if the purse doesn't hold enough total value.
function withdraw(currency: Currency, denom: keyof Currency, amount: number): Currency | null {
  const have = currency[denom];
  if (have >= amount) return { ...currency, [denom]: have - amount };

  const lender = LENDER[denom];
  if (!lender) return null;

  const factor = CP_VALUE[lender] / CP_VALUE[denom];
  const coinsToBreak = Math.ceil((amount - have) / factor);
  const broken = withdraw(currency, lender, coinsToBreak);
  if (!broken) return null;

  return { ...broken, [denom]: have + coinsToBreak * factor - amount };
}

// Adds `delta` coins of `denom` to the purse (or removes them, if negative), auto-calibrating
// across denominations when a removal would take `denom` below zero — e.g. removing 2 sp with
// none on hand breaks a gp into 10 sp and keeps the 8 sp left over. Returns null if the purse
// can't cover a removal.
export function adjustCurrency(currency: Currency, denom: keyof Currency, delta: number): Currency | null {
  if (delta >= 0) return { ...currency, [denom]: currency[denom] + delta };
  return withdraw(currency, denom, -delta);
}
