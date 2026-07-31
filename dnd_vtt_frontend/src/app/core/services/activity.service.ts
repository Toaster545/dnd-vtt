import { Injectable } from '@angular/core';

const ACTIVITY_KEY = 'dnd-last-activity';

// Tracks the last time the app was actively navigated, purely client-side (localStorage) — used
// by staleSessionGuard to decide whether a hard page reload should land on the dashboard instead
// of resuming wherever the URL points.
@Injectable({ providedIn: 'root' })
export class ActivityService {
  touch(): void {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  }

  // No stamp yet (first-ever visit) counts as "not stale" — there's nothing to have gone stale.
  isStale(thresholdMs: number): boolean {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) > thresholdMs;
  }
}
