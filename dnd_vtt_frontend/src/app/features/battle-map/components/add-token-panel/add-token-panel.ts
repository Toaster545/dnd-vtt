import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlacingEntity } from '../../../../core/models/campaign.model';

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
