import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Ability, ABILITIES, ABILITY_SHORT, STANDARD_ARRAY, abilityModifier } from '../../../../../../../core/models/character.model';

@Component({
  selector: 'app-abilities-step',
  imports: [FormsModule],
  templateUrl: './abilities-step.html',
})
export class AbilitiesStepComponent {
  readonly assignments        = input.required<Record<Ability, number | null>>();
  readonly bonusScores        = input.required<Record<Ability, number>>();
  readonly finalScores        = input.required<Record<Ability, number>>();
  readonly assignmentChanged  = output<{ ability: Ability; value: number | null }>();

  readonly abilities    = ABILITIES;
  readonly abilityShort = ABILITY_SHORT;
  readonly standardArray = STANDARD_ARRAY;

  assign(ab: Ability, value: number | null) {
    this.assignmentChanged.emit({ ability: ab, value });
  }

  optionsFor(ab: Ability): number[] {
    const current = this.assignments()[ab];
    const usedElsewhere = ABILITIES
      .filter(a => a !== ab)
      .map(a => this.assignments()[a])
      .filter((v): v is number => v !== null);
    return STANDARD_ARRAY.filter(v => v === current || !usedElsewhere.includes(v));
  }

  isValueAssigned(v: number): boolean {
    return Object.values(this.assignments()).includes(v);
  }

  asiFor(ab: Ability): number {
    return this.bonusScores()[ab];
  }

  mod(score: number): string {
    const m = abilityModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  }
}
