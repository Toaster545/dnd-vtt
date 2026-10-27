// Mirrors averageHpFormula in the frontend's character-effects.ts (no per-level bonus).
// Parity is checked by the shared fixtures test.
export function averageHp(
  level: number,
  hitDie: number,
  conMod: number,
): number {
  return Math.max(
    1,
    hitDie + conMod + (level - 1) * (Math.floor(hitDie / 2) + 1 + conMod),
  );
}
