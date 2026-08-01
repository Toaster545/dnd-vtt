import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackgroundService } from './core/services/background.service';
import { ColorSchemeService } from './core/services/color-scheme.service';
import { UiScaleService } from './core/services/ui-scale.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<div class="app-bg-overlay" aria-hidden="true"></div><router-outlet />',
})
export class App {
  private readonly _background = inject(BackgroundService);
  private readonly _colorScheme = inject(ColorSchemeService);
  private readonly _uiScale = inject(UiScaleService);
}
