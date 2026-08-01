import { Injectable, effect, signal } from '@angular/core';

export interface ColorSchemeOption {
  id: string;
  label: string;
}

export const COLOR_SCHEME_OPTIONS: ColorSchemeOption[] = [
  { id: 'gold', label: 'Gold' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'royal-blue', label: 'Royal Blue' },
  { id: 'silver', label: 'Silver' },
];

const STORAGE_KEY = 'dnd-vtt-color-scheme';
const DEFAULT_SCHEME = 'gold';

// Sets data-theme on <html>; the actual color values live in _tokens.scss ($themes) and are
// wired into CSS custom properties by the `@each` loop in styles.scss.
@Injectable({ providedIn: 'root' })
export class ColorSchemeService {
  readonly current = signal<string>(this.readStored());

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.current());
    });
  }

  set(id: string): void {
    this.current.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  private readStored(): string {
    const raw = localStorage.getItem(STORAGE_KEY);
    return COLOR_SCHEME_OPTIONS.some((o) => o.id === raw) ? raw! : DEFAULT_SCHEME;
  }
}
