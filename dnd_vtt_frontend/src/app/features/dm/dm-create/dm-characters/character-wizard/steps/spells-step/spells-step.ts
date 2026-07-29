import { Component, computed, input, output } from '@angular/core';
import { DndClass, DndRace, DndSpell } from '../../../../../../../core/services/content.service';

@Component({
  selector: 'app-spells-step',
  templateUrl: './spells-step.html',
})
export class SpellsStepComponent {
  readonly spells               = input.required<DndSpell[]>();
  readonly selectedClass        = input<DndClass | null>(null);
  readonly selectedRace         = input <DndRace | null>(null);
  readonly selectedSpellIndices = input.required<Set<string>>();
  readonly spellToggled         = output<string>();

  visibleSpells = computed(() => {
    const cls = this.selectedClass();
    const race = this.selectedRace();
    console.log(race);
    console.log(cls);
    if (!cls || !race) return this.spells();
    console.log(this.spells());
    return this.spells().filter(s => s.classes.includes(cls.name) || s.races?.includes(race.name));
  });
}
