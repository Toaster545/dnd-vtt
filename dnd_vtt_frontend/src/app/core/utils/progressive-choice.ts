export function resolveProgressiveChoiceLimit(
  baseLimit: number,
  limitsByLevel: Record<string, number> | undefined,
  classLevel: number,
): number {
  if (!limitsByLevel) return baseLimit;

  const unlocked = Object.entries(limitsByLevel)
    .map(([level, limit]) => ({ level: Number(level), limit }))
    .filter(({ level }) => Number.isFinite(level) && level <= classLevel)
    .sort((a, b) => b.level - a.level);

  return unlocked[0]?.limit ?? baseLimit;
}
