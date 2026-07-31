import { portraitDataUri } from '../../../core/utils/avatar';

export class PortraitCache {
  private images: Record<string, HTMLImageElement> = {};

  resolve(seeds: Record<string, string>, onLoaded: () => void): Record<string, HTMLImageElement> {
    const resolved: Record<string, HTMLImageElement> = {};
    for (const [characterId, seed] of Object.entries(seeds)) {
      const cacheKey = `${characterId}:${seed}`;
      let img = this.images[cacheKey];
      if (!img) {
        img = new Image();
        img.onload = onLoaded;
        img.src = portraitDataUri(seed);
        this.images[cacheKey] = img;
      }
      if (img.complete && img.naturalWidth) resolved[characterId] = img;
    }
    return resolved;
  }
}
