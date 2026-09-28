import { Injectable, signal } from '@angular/core';

export type HubView = 'wiki' | 'sheet';

const STORAGE_KEY = 'dnd-vtt-hub-view';
const SIDEBAR_WIDTH_KEY = 'dnd-vtt-hub-sidebar-width';
const MIN_SIDEBAR = 240;
const MAX_SIDEBAR = 640;
const DEFAULT_SIDEBAR = 360;

// Layout preferences for the player campaign/session hubs: which panel fills the main column (the
// campaign wiki or the player's own character sheet) and the width of the Sessions/Party sidebar.
// Shared by both hubs, so a change on the campaign hub carries over into its session hubs.
@Injectable({ providedIn: 'root' })
export class HubViewService {
  readonly current = signal<HubView>(this.readStored());
  readonly sidebarWidth = signal<number>(this.readStoredWidth());

  set(view: HubView): void {
    this.current.set(view);
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }

  setSidebarWidth(width: number): void {
    const clamped = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, width));
    this.sidebarWidth.set(clamped);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(clamped)));
    } catch {
      /* ignore */
    }
  }

  private readStoredWidth(): number {
    try {
      const n = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      return n >= MIN_SIDEBAR && n <= MAX_SIDEBAR ? n : DEFAULT_SIDEBAR;
    } catch {
      return DEFAULT_SIDEBAR;
    }
  }

  private readStored(): HubView {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'sheet' ? 'sheet' : 'wiki';
    } catch {
      return 'wiki';
    }
  }
}
