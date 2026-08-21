import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DndRace, DndClass, DndBackground } from '../../../../../core/services/content.service';
import { ALIGNMENTS } from '../../../../../core/models/character.model';

@Component({
  selector: 'app-details-step',
  imports: [FormsModule],
  templateUrl: './details-step.html',
})
export class DetailsStepComponent {
  readonly alignment          = input.required<string>();
  readonly maxHP              = input.required<number>();
  readonly suggestedMaxHP     = input.required<number>();
  readonly maxHpOverridden    = input(false);
  readonly armorClass         = input.required<number>();
  readonly speed              = input.required<number>();
  readonly profBonus          = input.required<number>();
  readonly selectedRace       = input<DndRace | null>(null);
  readonly selectedClass      = input<DndClass | null>(null);
  readonly selectedBackground = input<DndBackground | null>(null);

  readonly alignmentChanged = output<string>();
  readonly maxHpChanged = output<number | null>();

  readonly alignments = ALIGNMENTS;
  readonly editingMaxHp = signal(false);

  setMaxHp(value: string | number) {
    this.maxHpChanged.emit(Math.max(1, Math.floor(Number(value) || 1)));
  }
}
