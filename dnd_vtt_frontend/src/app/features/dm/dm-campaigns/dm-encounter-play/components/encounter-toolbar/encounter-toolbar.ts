import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Encounter } from '../../../../../../core/models/encounter.model';
import { MapToken } from '../../../../../../core/models/campaign.model';

@Component({
  selector: 'app-encounter-toolbar',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './encounter-toolbar.html',
})
export class EncounterToolbarComponent {
  readonly encounter = input.required<Encounter>();
  readonly currentTurnToken = input<MapToken | null>(null);
  readonly togglingStatus = input(false);
  readonly togglingTurn = input(false);

  readonly back = output<void>();
  readonly previousTurn = output<void>();
  readonly nextTurn = output<void>();
  readonly start = output<void>();
  readonly stop = output<void>();
}
