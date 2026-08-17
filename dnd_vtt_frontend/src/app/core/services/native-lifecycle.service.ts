import { Injectable, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AuthTokenService } from './auth-token.service';
import { PlayerContextService } from './player-context.service';
import { SocketService } from './socket.service';

@Injectable({ providedIn: 'root' })
export class NativeLifecycleService {
  private tokens = inject(AuthTokenService);
  private context = inject(PlayerContextService);
  private sockets = inject(SocketService);

  constructor() {
    if (!Capacitor.isNativePlatform()) return;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void this.resume();
    });
  }

  private async resume(): Promise<void> {
    const session = await this.tokens.refresh();
    if (!session) return;
    this.sockets.refreshAuthentication();
    await this.context.load().catch(() => undefined);
  }
}
