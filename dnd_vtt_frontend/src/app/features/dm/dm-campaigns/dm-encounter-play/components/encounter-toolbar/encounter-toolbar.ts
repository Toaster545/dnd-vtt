import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Encounter, EncounterLevel } from '../../../../../../core/models/encounter.model';
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
  // The encounter's levels and the one on screen; the level dropdown only shows with 2 or more.
  readonly levels = input<EncounterLevel[]>([]);
  readonly activeMapId = input<string | null>(null);

  readonly back = output<void>();
  readonly previousTurn = output<void>();
  readonly nextTurn = output<void>();
  readonly start = output<void>();
  readonly stop = output<void>();
  readonly openPlayerView = output<void>();
  readonly levelSelected = output<string>();

  onLevelChange(event: Event) {
    this.levelSelected.emit((event.target as HTMLSelectElement).value);
  }
}
