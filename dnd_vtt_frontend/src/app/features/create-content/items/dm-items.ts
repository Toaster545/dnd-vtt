import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ItemService } from '../../../core/services/item.service';
import { ContentService, DndContentSource, DndItem } from '../../../core/services/content.service';
import { ConfirmService } from '../../../shared/confirm.service';
import { ItemFormComponent } from './item-form/item-form';

@Component({
  selector: 'app-dm-items',
  imports: [ItemFormComponent, MatIconModule, FormsModule],
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

  search = signal('');
  sourceFilter = signal('all');
  officialExpanded = signal(false);

  filteredItems    = computed(() => this.filter(this.items(), 'HOMEBREW'));
  filteredOfficial = computed(() => this.filter(this.officialItems(), 'XPHB'));

  async ngOnInit() { await this.load(); }

  private filter(list: DndItem[], fallbackSource: string): DndItem[] {
    const q = this.search().trim().toLowerCase();
    const source = this.sourceFilter();
    return list.filter(item =>
      (!q || item.name.toLowerCase().includes(q)) &&
      (source === 'all' || (item.source?.code ?? fallbackSource) === source),
    );
  }

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
