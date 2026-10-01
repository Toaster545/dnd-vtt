import { Component, HostListener, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DndItem, DndMonster, DndSpell, itemDisplayName } from '../../../core/services/content.service';
import { monsterSpeedText } from '../../../core/utils/monster-speed';

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

  readonly speedText = monsterSpeedText;

  modifier(score: number): string {
    const value = Math.floor((score - 10) / 2);
    return value >= 0 ? `+${value}` : `${value}`;
  }

  readonly itemDisplayName = itemDisplayName;

  attunementText(item: DndItem): string {
    if (!item.requires_attunement) return 'No';
    return typeof item.requires_attunement === 'string' ? item.requires_attunement : 'Yes';
  }
}
