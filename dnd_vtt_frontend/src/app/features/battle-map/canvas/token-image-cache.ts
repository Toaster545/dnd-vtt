import { MapToken } from '../../../core/models/campaign.model';
import { monsterTokenUrl } from '../../../core/utils/monster-token';

// Monster token art, downloaded by the backend's scripts/download-monster-tokens.mjs. The DM's
// tokens carry monster_index; players only ever get image_url, and only while the token's name
// is visible to them (see the backend's serializePlayerTokens).
export function tokenImageUrl(token: MapToken): string | undefined {
  if (token.image_url) return token.image_url;
  return token.monster_index ? monsterTokenUrl(token.monster_index) : undefined;
}

export class TokenImageCache {
  // One entry per distinct monster type — a failed load (no art downloaded for that monster)
  // stays cached too, so it isn't refetched every render and the token keeps its color fill.
  private images = new Map<string, HTMLImageElement>();

  resolve(tokens: MapToken[], onLoaded: () => void): Record<string, HTMLImageElement> {
    const resolved: Record<string, HTMLImageElement> = {};
    for (const token of tokens) {
      const url = tokenImageUrl(token);
      if (!url || !token.id) continue;
      let img = this.images.get(url);
      if (!img) {
        img = new Image();
        img.onload = onLoaded;
        img.src = url;
        this.images.set(url, img);
      }
      if (img.complete && img.naturalWidth) resolved[token.id] = img;
    }
    return resolved;
  }
}
