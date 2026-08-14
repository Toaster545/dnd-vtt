import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Character } from '../../../../../../core/models/character.model';
import { MapToken } from '../../../../../../core/models/campaign.model';
import { portraitDataUri } from '../../../../../../core/utils/avatar';

@Component({
  selector: 'app-character-token-detail',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './character-token-detail.html',
})
export class CharacterTokenDetailComponent {
  readonly token = input.required<MapToken>();
  readonly character = input.required<Character>();

  readonly back = output<void>();
  readonly colorChanged = output<string>();
  readonly openSheet = output<void>();
  // null = clear the override (fall back to whatever the character's race grants); an explicit
  // number — including 0 — overrides it. See Character.darkvision_ft.
  readonly darkvisionChanged = output<number | null>();

  portraitUri(): string {
    const c = this.character();
    return portraitDataUri(c.portrait_seed || c.id!);
  }

  classLabel(): string {
    const c = this.character();
    return c.subclass ? `${c.subclass} (${c.class})` : c.class;
  }

  onDarkvisionInput(event: Event) {
    const raw = (event.target as HTMLInputElement).value.trim();
    const value = raw === '' ? null : Math.floor(Number(raw));
    if (raw !== '' && Number.isNaN(value)) return;
    this.darkvisionChanged.emit(value);
  }
}
