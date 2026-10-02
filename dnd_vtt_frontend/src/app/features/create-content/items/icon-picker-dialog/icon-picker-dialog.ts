import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ContentService, IconLibraryEntry } from '../../../../core/services/content.service';

@Component({
  selector: 'app-icon-picker-dialog',
  imports: [FormsModule, MatIconModule],
  templateUrl: './icon-picker-dialog.html',
})
export class IconPickerDialogComponent implements OnInit {
  private content = inject(ContentService);

  readonly showReset = input(false);
  readonly picked = output<IconLibraryEntry>();
  readonly resetRequested = output<void>();
  readonly closed = output<void>();

  loading = signal(true);
  icons = signal<IconLibraryEntry[]>([]);
  search = signal('');
  categoryFilter = signal<string | null>(null);

  categories = computed(() => {
    const seen = new Map<string, string>();
    for (const icon of this.icons()) seen.set(icon.category, icon.categoryLabel);
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  });

  // Spaces and hyphens are ignored so "battleaxe" (the item's spelling) still finds "Battle Axe".
  filtered = computed(() => {
    const q = normalize(this.search());
    const category = this.categoryFilter();
    return this.icons().filter(icon =>
      (!category || icon.category === category) &&
      (!q || normalize(icon.label).includes(q) || normalize(icon.author).includes(q)),
    );
  });

  async ngOnInit() {
    this.loading.set(true);
    this.icons.set(await this.content.getIconLibrary());
    this.loading.set(false);
  }

  @HostListener('document:keydown.escape')
  close() {
    this.closed.emit();
  }

  pick(icon: IconLibraryEntry) {
    this.picked.emit(icon);
  }

  resetToDefault() {
    this.resetRequested.emit();
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}
