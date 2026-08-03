import { Component, computed, input, output, signal } from '@angular/core';
import { DndBackground, DndClass, DndItem } from '../../../../../core/services/content.service';
import { Currency } from '../../../../../core/models/character.model';
import { isStructuredEquipment } from '../../../../../core/utils/starting-equipment';
import { EquipmentChoiceComponent } from './equipment-choice/equipment-choice';

@Component({
  selector: 'app-equipment-step',
  imports: [EquipmentChoiceComponent],
  templateUrl: './equipment-step.html',
})
export class EquipmentStepComponent {
  readonly items                = input.required<DndItem[]>();
  readonly selectedItemIndices  = input.required<Set<string>>();
  readonly currency             = input.required<Currency>();
  readonly classData            = input<DndClass | null>(null);
  readonly background           = input<DndBackground | null>(null);
  readonly classChoices         = input<Record<string, string[]>>({});
  readonly backgroundChoices    = input<Record<string, string[]>>({});

  readonly itemToggled              = output<string>();
  readonly classChoicesChanged      = output<Record<string, string[]>>();
  readonly backgroundChoicesChanged = output<Record<string, string[]>>();

  readonly search = signal('');

  readonly visibleItems = computed(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.items();
    return this.items().filter(item =>
      item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query));
  });

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  // Older content not yet converted to the structured "(a) gear or (b) gold" shape (still a
  // bare array of description strings) — the picker just doesn't render for that source until
  // its data is migrated, rather than erroring on the mismatched shape.
  classEquipment() {
    const equip = this.classData()?.starting_equipment;
    return isStructuredEquipment(equip) ? equip : null;
  }

  backgroundEquipment() {
    const equip = this.background()?.starting_equipment;
    return isStructuredEquipment(equip) ? equip : null;
  }
}
