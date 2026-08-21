import { Injectable } from '@angular/core';

const CHAR_VIEWED_KEY = 'dnd-char-viewed';
const CAMPAIGN_VIEWED_KEY = 'dnd-campaign-viewed';

// Per-browser "recently viewed" tracking, keyed by id → last-viewed timestamp. Not synced across
// devices — same tradeoff as the original characters-only version this was promoted from
// (features/characters/characters.ts), just extended to also cover campaigns for the dashboard.
@Injectable({ providedIn: 'root' })
export class RecentActivityService {
  markCharacterViewed(id: string): void {
    this.mark(CHAR_VIEWED_KEY, id);
  }

  sortByRecentlyViewed<T extends { id?: string }>(items: T[]): T[] {
    const views = this.read(CHAR_VIEWED_KEY);
    return [...items].sort((a, b) => (views[b.id!] ?? 0) - (views[a.id!] ?? 0));
  }

  lastViewedCharacterId(): string | null {
    return this.mostRecentKey(CHAR_VIEWED_KEY);
  }

  markCampaignViewed(id: string): void {
    this.mark(CAMPAIGN_VIEWED_KEY, id);
  }

  lastViewedCampaignId(): string | null {
    return this.mostRecentKey(CAMPAIGN_VIEWED_KEY);
  }

  sortCampaignsByRecentlyViewed<T extends { id: string }>(items: T[]): T[] {
    const views = this.read(CAMPAIGN_VIEWED_KEY);
    return [...items].sort((a, b) => (views[b.id] ?? 0) - (views[a.id] ?? 0));
  }

  private mark(key: string, id: string): void {
    const views = this.read(key);
    views[id] = Date.now();
    localStorage.setItem(key, JSON.stringify(views));
  }

  private read(key: string): Record<string, number> {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, number>
        : {};
    } catch {
      return {};
    }
  }

  private mostRecentKey(key: string): string | null {
    const views = this.read(key);
    const ids = Object.keys(views);
    if (!ids.length) return null;
    return ids.reduce((best, id) => (views[id] > views[best] ? id : best));
  }
}
