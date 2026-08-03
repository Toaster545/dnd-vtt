import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ItemService } from '../../../core/services/item.service';
import { ContentService, DndItem } from '../../../core/services/content.service';
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
  loading        = signal(true);
  showForm       = signal(false);
  editingItem    = signal<DndItem | null>(null);
  duplicatingItem = signal<DndItem | null>(null);

  search = signal('');
  officialExpanded = signal(false);

  filteredItems    = computed(() => this.filterByName(this.items()));
  filteredOfficial = computed(() => this.filterByName(this.officialItems()));

  async ngOnInit() { await this.load(); }

  private filterByName(list: DndItem[]): DndItem[] {
    const q = this.search().trim().toLowerCase();
    return q ? list.filter(i => i.name.toLowerCase().includes(q)) : list;
  }

  onSearchChange(v: string) {
    this.search.set(v);
    if (v.trim()) this.officialExpanded.set(true);
  }

  private async load() {
    this.loading.set(true);
    // Own library (editable) + the static SRD set (read-only reference) — the campaign-merged
    // set the character wizard/sheet actually use lives behind getItems(campaignId), separately.
    const [mine, official] = await Promise.all([
      this.itemService.getMine(),
      this.content.getItems(),
    ]);
    this.items.set(mine);
    this.officialItems.set(official);
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
