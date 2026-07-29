import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlacingEntity } from '../../../../core/models/campaign.model';

// The DM sidebar's "Add Token" form, or — when embedded in an encounter's roster-driven play
// view — a short status line for the armed roster entry instead. `newToken` is the same mutable
// object the parent owns; [(ngModel)] here mutates it in place, same as a plain single-template
// binding would.
@Component({
  selector: 'app-add-token-panel',
  imports: [FormsModule],
  templateUrl: './add-token-panel.html',
})
export class AddTokenPanelComponent {
  readonly embedded = input(false);
  readonly placingEntity = input<PlacingEntity | null>(null);
  readonly newToken = input.required<{ label: string; color: string; size: number; is_player: boolean }>();
}
