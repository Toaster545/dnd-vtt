import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MapToken } from '../../../../../../core/models/campaign.model';

@Component({
  selector: 'app-custom-token-editor',
  imports: [FormsModule, MatIconModule],
  templateUrl: './custom-token-editor.html',
})
export class CustomTokenEditorComponent {
  readonly token = input.required<MapToken>();

  readonly back = output<void>();
  readonly labelChanged = output<string>();
  readonly colorChanged = output<string>();
  readonly sizeChanged = output<number>();
  readonly remove = output<void>();
}
