import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class PwaService {
  private updates = inject(SwUpdate, { optional: true });
  readonly online = signal(navigator.onLine);
  readonly installAvailable = signal(false);
  readonly reconnecting = signal(false);
  private installEvent?: InstallPromptEvent;

  constructor() {
    window.addEventListener('online', () => {
      this.online.set(true);
      this.reconnecting.set(true);
      window.setTimeout(() => this.reconnecting.set(false), 1500);
    });
    window.addEventListener('offline', () => this.online.set(false));
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installEvent = event as InstallPromptEvent;
      this.installAvailable.set(true);
    });
    if (Capacitor.isNativePlatform()) {
      void Network.addListener('networkStatusChange', ({ connected }) => {
        this.online.set(connected);
      });
    }
    if (this.updates?.isEnabled) {
      this.updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY' && window.confirm('A new D&D VTT version is ready. Reload now?')) {
          void this.updates?.activateUpdate().then(() => document.location.reload());
        }
      });
    }
  }

  async install(): Promise<void> {
    if (!this.installEvent) return;
    await this.installEvent.prompt();
    await this.installEvent.userChoice;
    this.installEvent = undefined;
    this.installAvailable.set(false);
  }
}
