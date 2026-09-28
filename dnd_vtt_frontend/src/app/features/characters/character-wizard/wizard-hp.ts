// The current HP to save alongside a (possibly edited) max HP. Any max HP added since the wizard
// opened is added to current HP as well — gaining a level heals by the HP it grants — and the
// result is clamped so a lowered max never leaves current HP above it. Both baselines must be the
// values the wizard *loaded*, not the latest autosave: measuring against a just-saved max would
// zero the gain and write the stale current HP straight back.
// A brand-new character (nothing loaded) starts at full HP.
export function carriedCurrentHp(
  loadedCurrentHp: number | null,
  loadedMaxHp: number | null,
  maxHp: number,
): number {
  const gain = loadedMaxHp !== null ? Math.max(0, maxHp - loadedMaxHp) : 0;
  return Math.min((loadedCurrentHp ?? maxHp) + gain, maxHp);
}
