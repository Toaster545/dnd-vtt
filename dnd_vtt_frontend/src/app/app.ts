import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackgroundService } from './core/services/background.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<div class="app-bg-overlay" aria-hidden="true"></div><router-outlet />',
})
export class App {
  private readonly _background = inject(BackgroundService);
}
