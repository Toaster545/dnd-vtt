import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MapLight } from '../../../../core/models/campaign.model';

// Shown in the right-aside when a DM has a torch marker selected. One-way bound (never mutates
// `light` directly, unlike add-token-panel's plain-object convention) since a MapLight comes from
// a live signal — every edit round-trips through `fieldChanged` -> BattleMapService.upsertLight
// instead, same as the rest of the lighting feature's "server is the source of truth" pattern.
@Component({
  selector: 'app-light-editor-panel',
  imports: [FormsModule, MatTooltipModule],
  templateUrl: './light-editor-panel.html',
})
export class LightEditorPanelComponent {
  readonly light = input.required<MapLight>();

  readonly fieldChanged = output<Partial<MapLight>>();
  readonly deleteRequested = output<void>();
  readonly closed = output<void>();
}
