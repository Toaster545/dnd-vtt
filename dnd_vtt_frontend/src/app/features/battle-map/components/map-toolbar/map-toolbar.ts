import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FogToolName, LightToolName, MeasureShape } from '../../../../core/models/campaign.model';

// Floating button cluster over the canvas: select/measure/move-range tools (everyone) plus
// fog-of-war brush/rectangle tools and lighting/torch tools (DM only, gated by `isAdmin`).
@Component({
  selector: 'app-map-toolbar',
  imports: [MatIconModule, MatTooltipModule, FormsModule],
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
  // Only set once hasMyToken() is true. Everyone can recolor their own token — DM included, via
  // the same control — it just doesn't require DM privileges the way the rest of this toolbar does.
  readonly myTokenColor = input<string | null>(null);
  readonly isAdmin = input(false);

  readonly selectPointerTool = output<void>();
  readonly measureToolToggled = output<MeasureShape>();
  readonly moveRangeToggled = output<void>();
  readonly myTokenColorChanged = output<string>();
  readonly fogEnabledToggled = output<void>();
  readonly fogToolToggled = output<FogToolName>();
  readonly revealAllFog = output<void>();
  readonly lightingEnabledToggled = output<void>();
  readonly lightToolToggled = output<void>();
}
