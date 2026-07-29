import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FogToolName, MeasureShape } from '../../../../core/models/campaign.model';

// Floating button cluster over the canvas: select/measure/move-range tools (everyone) plus
// fog-of-war brush/rectangle tools (DM only, gated by `isAdmin`).
@Component({
  selector: 'app-map-toolbar',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './map-toolbar.html',
})
export class MapToolbarComponent {
  readonly activeMeasureTool = input<MeasureShape | null>(null);
  readonly activeFogTool = input<FogToolName | null>(null);
  readonly fogEnabled = input(false);
  readonly showMoveRange = input(false);
  readonly hasMyToken = input(false);
  readonly isAdmin = input(false);

  readonly selectPointerTool = output<void>();
  readonly measureToolToggled = output<MeasureShape>();
  readonly moveRangeToggled = output<void>();
  readonly fogEnabledToggled = output<void>();
  readonly fogToolToggled = output<FogToolName>();
  readonly revealAllFog = output<void>();
}
