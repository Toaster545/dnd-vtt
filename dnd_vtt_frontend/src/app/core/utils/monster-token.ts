// Where the backend's scripts/download-monster-tokens.mjs saves each monster's token art. A
// monster without downloaded art (most homebrew) 404s here, so callers need a fallback.
export function monsterTokenUrl(monsterIndex: string): string {
  return `/uploads/monster-tokens/${encodeURIComponent(monsterIndex)}.webp`;
}
