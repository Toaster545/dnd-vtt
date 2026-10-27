export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
