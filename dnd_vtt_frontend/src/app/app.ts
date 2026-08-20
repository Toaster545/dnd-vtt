import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackgroundService } from './core/services/background.service';
import { ColorSchemeService } from './core/services/color-scheme.service';
import { UiScaleService } from './core/services/ui-scale.service';
import { PwaService } from './core/services/pwa.service';
import { NativeLifecycleService } from './core/services/native-lifecycle.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <div class="app-bg-overlay" aria-hidden="true"></div>
    @if (!pwa.online()) {
      <div class="connection-banner" role="status">Offline — saved screens remain available; changes require a connection.</div>
    } @else if (pwa.reconnecting()) {
      <div class="connection-banner" role="status">Reconnected — refreshing live state…</div>
    }
    <router-outlet />
  `,
  styles: [`
    .connection-banner { position: fixed; z-index: 10000; inset: 0 0 auto; padding: .5rem 1rem; text-align: center; background: #7f1d1d; color: white; }
  `],
})
export class App {
  private readonly _background = inject(BackgroundService);
  private readonly _colorScheme = inject(ColorSchemeService);
  private readonly _uiScale = inject(UiScaleService);
  readonly pwa = inject(PwaService);
  private readonly _nativeLifecycle = inject(NativeLifecycleService);
}
