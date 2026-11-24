import { Injectable, signal } from '@angular/core';
import { persistWidth, readStoredWidth } from '../utils/storage-keys';

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
  readonly sidebarWidth = signal<number>(
    readStoredWidth(SIDEBAR_WIDTH_KEY, MIN_SIDEBAR, MAX_SIDEBAR, DEFAULT_SIDEBAR),
  );

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
    persistWidth(SIDEBAR_WIDTH_KEY, clamped);
  }

  private readStored(): HubView {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'sheet' ? 'sheet' : 'wiki';
    } catch {
      return 'wiki';
    }
  }
}
