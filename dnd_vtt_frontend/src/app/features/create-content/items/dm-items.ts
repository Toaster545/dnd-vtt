import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ItemService } from '../../../core/services/item.service';
import { ContentService, DndContentSource, DndItem } from '../../../core/services/content.service';
import { ConfirmService } from '../../../shared/confirm.service';
import { ItemFormComponent } from './item-form/item-form';
import { ContentDetailDialogComponent } from '../content-detail-dialog/content-detail-dialog';
import { ContentSourceFilterComponent } from '../content-source-filter/content-source-filter';

type ItemSort = 'name-asc' | 'name-desc' | 'source-asc' | 'type-asc';

@Component({
  selector: 'app-dm-items',
  imports: [ItemFormComponent, ContentDetailDialogComponent, ContentSourceFilterComponent, MatIconModule, FormsModule],
  templateUrl: './dm-items.html',
})
export class DmItemsComponent implements OnInit {
  private itemService = inject(ItemService);
  private content = inject(ContentService);
  private confirm = inject(ConfirmService);

  items          = signal<DndItem[]>([]);
  officialItems  = signal<DndItem[]>([]);
  sources        = signal<DndContentSource[]>([]);
  loading        = signal(true);
  showForm       = signal(false);
  editingItem    = signal<DndItem | null>(null);
  duplicatingItem = signal<DndItem | null>(null);
  detailItem = signal<DndItem | null>(null);

  search = signal('');
  sourceFilters = signal<string[]>([]);
  sort = signal<ItemSort>('name-asc');
  officialExpanded = signal(true);

  filteredItems    = computed(() => this.filter(this.items(), 'HOMEBREW'));
  filteredOfficial = computed(() => this.filter(this.officialItems(), 'XPHB'));

  async ngOnInit() { await this.load(); }

  private filter(list: DndItem[], fallbackSource: string): DndItem[] {
    const q = this.search().trim().toLowerCase();
    const sources = this.sourceFilters();
    const filtered = list.filter(item =>
      (!q || item.name.toLowerCase().includes(q)) &&
      (sources.length === 0 || sources.includes(item.source?.code ?? fallbackSource)),
    );
    return filtered.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      switch (this.sort()) {
        case 'name-desc': return -byName;
        case 'source-asc': return (a.source?.book ?? fallbackSource).localeCompare(b.source?.book ?? fallbackSource) || byName;
        case 'type-asc': return a.type.localeCompare(b.type) || a.category.localeCompare(b.category) || byName;
        default: return byName;
      }
    });
  }

  setSourceFilters(codes: string[]) { this.sourceFilters.set(codes); }

  onSearchChange(v: string) {
    this.search.set(v);
    if (v.trim()) this.officialExpanded.set(true);
  }

  private async load() {
    this.loading.set(true);
    // Own library (editable) + the static SRD set (read-only reference) — the campaign-merged
    // set the character wizard/sheet actually use lives behind getItems(campaignId), separately.
    const [mine, official, sources] = await Promise.all([
      this.itemService.getMine(),
      this.content.getItems(),
      this.content.getSources(),
    ]);
    this.items.set(mine);
    this.officialItems.set(official);
    this.sources.set(sources);
    this.loading.set(false);
  }

  openCreate() {
    this.editingItem.set(null);
    this.duplicatingItem.set(null);
    this.showForm.set(true);
  }
  openEdit(item: DndItem) {
    this.editingItem.set(item);
    this.duplicatingItem.set(null);
    this.showForm.set(true);
  }
  openDetails(item: DndItem) { this.detailItem.set(item); }
  closeDetails() { this.detailItem.set(null); }
  openDuplicate(item: DndItem, event: Event) {
    event.stopPropagation();
    this.editingItem.set(null);
    this.duplicatingItem.set(item);
    this.showForm.set(true);
  }

  async onSaved() {
    this.showForm.set(false);
    await this.load();
  }
  onCancelled() { this.showForm.set(false); }

  async onDelete(item: DndItem, event: Event) {
    event.stopPropagation();
    const ok = await this.confirm.confirm(`Delete "${item.name}"? This can't be undone.`, 'Delete item');
    if (!ok) return;
    await this.itemService.deleteItem(item.index);
    await this.load();
  }
}
