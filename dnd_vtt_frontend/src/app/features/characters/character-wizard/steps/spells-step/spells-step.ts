import { Component, computed, input, output } from '@angular/core';
import { DndClass, DndSpell } from '../../../../../core/services/content.service';

@Component({
  selector: 'app-spells-step',
  templateUrl: './spells-step.html',
})
export class SpellsStepComponent {
  readonly spells               = input.required<DndSpell[]>();
  readonly selectedClass        = input<DndClass | null>(null);
  readonly selectedSpellIndices = input.required<Set<string>>();
  readonly spellToggled         = output<string>();

  visibleSpells = computed(() => {
    const cls = this.selectedClass();
    if (!cls) return this.spells();
    return this.spells().filter(s => s.classes.includes(cls.name));
  });
}
