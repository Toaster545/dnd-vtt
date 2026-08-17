import { PortraitSource } from '../../../core/models/avatar.model';
import { avatarRecipeKey, portraitDataUri } from '../../../core/utils/avatar';

export class PortraitCache {
  private readonly limit = 200;
  private images = new Map<string, HTMLImageElement>();

  resolve(sources: Record<string, PortraitSource>, onLoaded: () => void): Record<string, HTMLImageElement> {
    const resolved: Record<string, HTMLImageElement> = {};
    for (const [characterId, source] of Object.entries(sources)) {
      const identity = source.kind === 'legacy'
        ? `legacy:${source.seed}`
        : `recipe:${avatarRecipeKey(source.recipe)}`;
      const cacheKey = `${characterId}:${identity}`;
      let img = this.images.get(cacheKey);
      if (!img) {
        img = new Image();
        img.onload = onLoaded;
        img.src = portraitDataUri(source);
        this.images.set(cacheKey, img);
        while (this.images.size > this.limit) {
          const oldest = this.images.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          this.images.delete(oldest);
        }
      } else {
        this.images.delete(cacheKey);
        this.images.set(cacheKey, img);
      }
      if (img.complete && img.naturalWidth) resolved[characterId] = img;
    }
    return resolved;
  }
}
