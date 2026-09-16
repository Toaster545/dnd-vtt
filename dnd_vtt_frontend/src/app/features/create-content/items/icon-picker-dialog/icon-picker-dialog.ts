import { Component, HostListener, OnInit, computed, inject, output, signal } from '@angular/core';
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

  readonly picked = output<IconLibraryEntry>();
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

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const category = this.categoryFilter();
    return this.icons().filter(icon =>
      (!category || icon.category === category) &&
      (!q || icon.label.toLowerCase().includes(q) || icon.author.toLowerCase().includes(q)),
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
}
