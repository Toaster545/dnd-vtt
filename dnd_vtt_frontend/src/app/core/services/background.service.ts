import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface BackgroundOption {
  id: string;
  label: string;
  /** Present only for user-supplied images discovered via GET /api/backgrounds. */
  imageUrl?: string;
}

export const BUILTIN_BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'none', label: 'Default' },
  { id: 'parchment', label: 'Parchment' },
  { id: 'stone', label: 'Dungeon Stone' },
  { id: 'starfield', label: 'Starfield' },
  { id: 'mist', label: 'Arcane Mist' },
];

const STORAGE_KEY = 'dnd-vtt-background';
const BUILTIN_BODY_CLASSES = BUILTIN_BACKGROUND_OPTIONS.map((o) => `bg-image-${o.id}`);
const OVERLAY_ALPHA_PROPERTY = '--app-bg-overlay-alpha';

export function customBackgroundCss(url: string): string {
  return `linear-gradient(rgba(13, 14, 22, 0.72), rgba(13, 14, 22, 0.72)), url('${url}')`;
}

@Injectable({ providedIn: 'root' })
export class BackgroundService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);

  readonly current = signal<string>(this.readStored());
  private readonly customOptions = signal<BackgroundOption[]>([]);

  readonly options = computed<BackgroundOption[]>(() => [
    ...BUILTIN_BACKGROUND_OPTIONS,
    ...this.customOptions(),
  ]);

  constructor() {
    effect(() => this.apply(this.current(), this.customOptions()));

    this.http.get<{ id: string; url: string }[]>('/api/backgrounds').subscribe({
      next: (files) =>
        this.customOptions.set(
          files.map((f) => ({ id: `custom:${f.id}`, label: labelFor(f.id), imageUrl: f.url })),
        ),
      error: () => this.customOptions.set([]),
    });

    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(() => {
      let route = this.activatedRoute.root;
      while (route.firstChild) route = route.firstChild;
      const bgOverlay = route.snapshot.data['bgOverlay'];
      if (typeof bgOverlay === 'number') this.setPageOverlay(bgOverlay);
      else this.resetPageOverlay();
    });
  }

  set(id: string): void {
    this.current.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  /** Developer-facing: darken the shared background overlay for as long as the caller is mounted. */
  setPageOverlay(alpha: number): void {
    document.documentElement.style.setProperty(OVERLAY_ALPHA_PROPERTY, String(alpha));
  }

  /** Reverts to the app-wide default declared on :root in styles.scss. */
  resetPageOverlay(): void {
    document.documentElement.style.removeProperty(OVERLAY_ALPHA_PROPERTY);
  }

  private readStored(): string {
    return localStorage.getItem(STORAGE_KEY) ?? 'none';
  }

  private apply(id: string, customs: BackgroundOption[]): void {
    document.body.classList.remove(...BUILTIN_BODY_CLASSES);

    const custom = customs.find((o) => o.id === id);
    if (custom?.imageUrl) {
      document.body.style.backgroundImage = `url('${custom.imageUrl}')`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      return;
    }

    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundRepeat = '';
    const builtinId = BUILTIN_BACKGROUND_OPTIONS.some((o) => o.id === id) ? id : 'none';
    document.body.classList.add(`bg-image-${builtinId}`);
  }
}

function labelFor(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
