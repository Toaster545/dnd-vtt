import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FogToolName, LightToolName, MeasureShape } from '../../../../core/models/campaign.model';

// Floating button cluster over the canvas: select/measure/move-range tools (everyone) plus
// fog-of-war brush/rectangle tools and lighting/torch tools (DM only, gated by `isAdmin`).
@Component({
  selector: 'app-map-toolbar',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './map-toolbar.html',
})
export class MapToolbarComponent {
  readonly activeMeasureTool = input<MeasureShape | null>(null);
  readonly activeFogTool = input<FogToolName | null>(null);
  readonly fogEnabled = input(false);
  readonly activeLightTool = input<LightToolName | null>(null);
  readonly lightingEnabled = input(false);
  readonly showMoveRange = input(false);
  readonly hasMyToken = input(false);
  readonly isAdmin = input(false);
  // Player only: picking the square they'd like the DM to move their token to on their turn.
  readonly pickingDestination = input(false);
  readonly hasDestination = input(false);

  readonly selectPointerTool = output<void>();
  readonly measureToolToggled = output<MeasureShape>();
  readonly moveRangeToggled = output<void>();
  readonly fogEnabledToggled = output<void>();
  readonly fogToolToggled = output<FogToolName>();
  readonly revealAllFog = output<void>();
  readonly lightingEnabledToggled = output<void>();
  readonly lightToolToggled = output<LightToolName>();
  readonly clearWalls = output<void>();
  readonly destinationToolToggled = output<void>();
  readonly clearDestination = output<void>();
}
