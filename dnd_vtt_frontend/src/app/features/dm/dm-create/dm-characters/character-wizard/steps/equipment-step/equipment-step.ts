import { Component, input, output } from '@angular/core';
import { DndItem } from '../../../../../../../core/services/content.service';

@Component({
  selector: 'app-equipment-step',
  templateUrl: './equipment-step.html',
})
export class EquipmentStepComponent {
  readonly items                = input.required<DndItem[]>();
  readonly selectedItemIndices  = input.required<Set<string>>();
  readonly itemToggled          = output<string>();
}
