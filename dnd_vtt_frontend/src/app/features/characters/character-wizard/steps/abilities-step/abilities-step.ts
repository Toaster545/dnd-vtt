import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Ability, ABILITIES, ABILITY_SHORT, STANDARD_ARRAY, abilityModifier,
  ScoreMethod, POINT_BUY_BUDGET, POINT_BUY_MIN, POINT_BUY_MAX, POINT_BUY_COST,
} from '../../../../../core/models/character.model';

@Component({
  selector: 'app-abilities-step',
  imports: [FormsModule],
  templateUrl: './abilities-step.html',
})
export class AbilitiesStepComponent {
  readonly assignments        = input.required<Record<Ability, number | null>>();
  readonly bonusScores        = input.required<Record<Ability, number>>();
  readonly finalScores        = input.required<Record<Ability, number>>();
  readonly method              = input.required<ScoreMethod>();
  readonly assignmentChanged  = output<{ ability: Ability; value: number | null }>();
  readonly methodChanged      = output<ScoreMethod>();

  readonly abilities      = ABILITIES;
  readonly abilityShort   = ABILITY_SHORT;
  readonly standardArray  = STANDARD_ARRAY;
  readonly pointBuyBudget = POINT_BUY_BUDGET;
  readonly pointBuyMin    = POINT_BUY_MIN;
  readonly pointBuyMax    = POINT_BUY_MAX;

  readonly methods: { value: ScoreMethod; label: string }[] = [
    { value: 'standard', label: 'Standard Array' },
    { value: 'pointbuy', label: 'Point Buy' },
    { value: 'manual', label: 'Manual Entry' },
  ];

  setMethod(method: ScoreMethod) {
    this.methodChanged.emit(method);
  }

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

  pointBuyCost(ab: Ability): number {
    const v = this.assignments()[ab];
    return v === null ? 0 : (POINT_BUY_COST[v] ?? 0);
  }

  pointBuySpent(): number {
    return ABILITIES.reduce((sum, ab) => sum + this.pointBuyCost(ab), 0);
  }

  pointBuyRemaining(): number {
    return this.pointBuyBudget - this.pointBuySpent();
  }

  canPointBuyIncrement(ab: Ability): boolean {
    const current = this.assignments()[ab] ?? this.pointBuyMin;
    if (current >= this.pointBuyMax) return false;
    const delta = (POINT_BUY_COST[current + 1] ?? Infinity) - (POINT_BUY_COST[current] ?? 0);
    return this.pointBuyRemaining() - delta >= 0;
  }

  canPointBuyDecrement(ab: Ability): boolean {
    return (this.assignments()[ab] ?? this.pointBuyMin) > this.pointBuyMin;
  }

  pointBuyIncrement(ab: Ability) {
    if (!this.canPointBuyIncrement(ab)) return;
    const current = this.assignments()[ab] ?? this.pointBuyMin;
    this.assign(ab, current + 1);
  }

  pointBuyDecrement(ab: Ability) {
    if (!this.canPointBuyDecrement(ab)) return;
    const current = this.assignments()[ab] ?? this.pointBuyMin;
    this.assign(ab, current - 1);
  }

  manualChange(ab: Ability, raw: string | number | null) {
    if (raw === '' || raw === null) {
      this.assign(ab, null);
      return;
    }
    const parsed = Math.round(Number(raw));
    if (Number.isNaN(parsed)) return;
    this.assign(ab, Math.min(30, Math.max(1, parsed)));
  }
}
