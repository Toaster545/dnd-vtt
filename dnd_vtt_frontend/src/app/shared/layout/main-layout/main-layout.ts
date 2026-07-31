import { Component, input } from '@angular/core';

// Outer full-height flex column shared by every top-level routed view (shell, map manager,
// battle map): a header slot (projected via the `layoutHeader` attribute selector) stacked
// above the page body. `embedded` swaps `h-screen` for `h-full` when the view is mounted inside
// another layout (e.g. battle-map embedded in the live-play screen) rather than owning the
// viewport itself.
@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.html',
})
export class MainLayoutComponent {
  embedded = input(false);
}
