import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MapToken } from '../../../../core/models/campaign.model';

// Turn order list, sorted highest-initiative-first by the parent. `editable` switches between
// the DM's version (initiative input, reroll, remove) and the read-only version players see.
@Component({
  selector: 'app-turn-order-panel',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './turn-order-panel.html',
})
export class TurnOrderPanelComponent {
  readonly tokens = input.required<MapToken[]>();
  readonly currentTurnTokenId = input<string | null>(null);
  readonly editable = input(false);

  readonly initiativeChanged = output<{ token: MapToken; value: string }>();
  readonly rerollInitiative = output<MapToken>();
  readonly removeToken = output<MapToken>();
}
