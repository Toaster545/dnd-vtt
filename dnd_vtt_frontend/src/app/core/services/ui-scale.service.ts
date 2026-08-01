import { Injectable, effect, signal } from '@angular/core';

export interface UiScaleOption {
  value: number;
  label: string;
}

export const UI_SCALE_OPTIONS: UiScaleOption[] = [
  { value: 100, label: '100%' },
  { value: 110, label: '110%' },
  { value: 125, label: '125%' },
  { value: 150, label: '150%' },
];

const STORAGE_KEY = 'dnd-vtt-ui-scale';
const DEFAULT_SCALE = 100;

// Scales the app by setting the root font-size, since the app's spacing/typography is built on
// Tailwind's rem-based utilities and the design tokens in _tokens.scss — bumping the root size
// scales all of it uniformly, the same way browser zoom would, without the user needing to zoom.
@Injectable({ providedIn: 'root' })
export class UiScaleService {
  readonly current = signal<number>(this.readStored());

  constructor() {
    effect(() => {
      document.documentElement.style.fontSize = `${this.current()}%`;
    });
  }

  set(value: number): void {
    this.current.set(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }

  private readStored(): number {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return UI_SCALE_OPTIONS.some((o) => o.value === parsed) ? parsed : DEFAULT_SCALE;
  }
}
