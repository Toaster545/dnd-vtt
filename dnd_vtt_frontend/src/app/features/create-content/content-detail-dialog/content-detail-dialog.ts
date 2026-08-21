import { Component, HostListener, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DndItem, DndMonster, DndSpell } from '../../../core/services/content.service';

@Component({
  selector: 'app-content-detail-dialog',
  imports: [MatIconModule],
  templateUrl: './content-detail-dialog.html',
})
export class ContentDetailDialogComponent {
  readonly spell = input<DndSpell | null>(null);
  readonly monster = input<DndMonster | null>(null);
  readonly item = input<DndItem | null>(null);
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  close() {
    this.closed.emit();
  }

  speedText(monster: DndMonster): string {
    const labels: Record<keyof DndMonster['speed'], string> = {
      walk: 'Walk',
      fly: 'Fly',
      swim: 'Swim',
      climb: 'Climb',
      burrow: 'Burrow',
    };
    return (Object.entries(monster.speed) as [keyof DndMonster['speed'], number | undefined][])
      .filter((entry): entry is [keyof DndMonster['speed'], number] => typeof entry[1] === 'number')
      .map(([kind, distance]) => `${labels[kind]} ${distance} ft.`)
      .join(', ');
  }

  modifier(score: number): string {
    const value = Math.floor((score - 10) / 2);
    return value >= 0 ? `+${value}` : `${value}`;
  }

  attunementText(item: DndItem): string {
    if (!item.requires_attunement) return 'No';
    return typeof item.requires_attunement === 'string' ? item.requires_attunement : 'Yes';
  }
}
