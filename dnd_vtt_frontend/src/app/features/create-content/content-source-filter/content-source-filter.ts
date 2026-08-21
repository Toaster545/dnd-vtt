import { Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DndContentSource } from '../../../core/services/content.service';

@Component({
  selector: 'app-content-source-filter',
  imports: [MatIconModule],
  templateUrl: './content-source-filter.html',
})
export class ContentSourceFilterComponent {
  readonly sources = input.required<DndContentSource[]>();
  readonly selected = input<string[]>([]);
  readonly selectedChange = output<string[]>();
  readonly open = signal(false);

  readonly label = computed(() => {
    const count = this.selected().length;
    if (count === 0) return 'All sources';
    if (count === 1) {
      return this.sources().find(source => source.code === this.selected()[0])?.short_name ?? '1 source';
    }
    return `${count} sources`;
  });

  isSelected(code: string): boolean {
    return this.selected().includes(code);
  }

  toggle(code: string, checked: boolean) {
    const next = new Set(this.selected());
    if (checked) next.add(code);
    else next.delete(code);
    this.selectedChange.emit([...next]);
  }

  clear() {
    this.selectedChange.emit([]);
  }
}
