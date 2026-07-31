import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DndMonster } from '../../../../../../core/services/content.service';
import { MapToken } from '../../../../../../core/models/campaign.model';
import { ABILITY_SHORT, Ability } from '../../../../../../core/models/character.model';

@Component({
  selector: 'app-monster-token-detail',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './monster-token-detail.html',
})
export class MonsterTokenDetailComponent {
  readonly token = input.required<MapToken>();
  readonly monster = input.required<DndMonster>();
  readonly hpAdjustAmount = input(0);

  readonly back = output<void>();
  readonly colorChanged = output<string>();
  readonly hpAdjustAmountChanged = output<number>();
  readonly adjustHp = output<number>();

  currentHp(): number {
    return this.token().hp ?? this.monster().hit_points;
  }

  maxHp(): number {
    return this.token().max_hp ?? this.monster().hit_points;
  }

  savingThrows(): string {
    const entries = Object.entries(this.monster().saving_throws ?? {});
    return entries
      .map(([ability, bonus]) => {
        const short = ABILITY_SHORT[ability.toLowerCase() as Ability] ?? ability.slice(0, 3).toUpperCase();
        return `${short} ${bonus >= 0 ? '+' : ''}${bonus}`;
      })
      .join(', ');
  }
}
