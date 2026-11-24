// Central registry of browser-storage keys that more than one file touches, plus a shared helper for
// "remember a panel width" preferences.
//
// Naming convention for NEW keys: `dnd-vtt-<feature>-<thing>` (kebab-case). Existing keys below keep
// their historical spelling on purpose — renaming one would silently reset every user's saved value.
export const ACTIVE_DRAFT_KEY = 'character.active-draft-id';
export const ACTIVE_DRAFT_STEP_KEY = 'character.active-draft-step';

/** Reads a persisted panel width, falling back to `fallback` when unset, invalid or out of range. */
export function readStoredWidth(key: string, min: number, max: number, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    return n >= min && n <= max ? n : fallback;
  } catch {
    return fallback;
  }
}

export function persistWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(Math.round(width)));
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}
