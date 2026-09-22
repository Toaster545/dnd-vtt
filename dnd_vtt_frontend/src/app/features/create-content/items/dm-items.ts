import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ItemService } from '../../../core/services/item.service';
import { ContentService, DndContentSource, DndItem, itemDisplayName } from '../../../core/services/content.service';
import { ConfirmService } from '../../../shared/confirm.service';
import { ItemFormComponent } from './item-form/item-form';
import { ContentDetailDialogComponent } from '../content-detail-dialog/content-detail-dialog';
import { ContentSourceFilterComponent } from '../content-source-filter/content-source-filter';
import { ItemCardPrintComponent } from './item-card-print/item-card-print';
import { IconPickerDialogComponent } from './icon-picker-dialog/icon-picker-dialog';
import { IconLibraryEntry } from '../../../core/services/content.service';
import { HttpErrorResponse } from '@angular/common/http';

type ItemSort = 'name-asc' | 'name-desc' | 'source-asc' | 'type-asc';

@Component({
  selector: 'app-dm-items',
  imports: [ItemFormComponent, ContentDetailDialogComponent, ContentSourceFilterComponent, ItemCardPrintComponent, IconPickerDialogComponent, MatIconModule, FormsModule],
  templateUrl: './dm-items.html',
})
export class DmItemsComponent implements OnInit {
  private itemService = inject(ItemService);
  private content = inject(ContentService);
  private confirm = inject(ConfirmService);

  readonly itemDisplayName = itemDisplayName;

  items          = signal<DndItem[]>([]);
  officialItems  = signal<DndItem[]>([]);
  sources        = signal<DndContentSource[]>([]);
  loading        = signal(true);
  showForm       = signal(false);
  editingItem    = signal<DndItem | null>(null);
  duplicatingItem = signal<DndItem | null>(null);
  detailItem = signal<DndItem | null>(null);
  editingImageFor = signal<DndItem | null>(null);

  printMode = signal(false);
  selectedForPrint = signal<Set<string>>(new Set());
  showPrintView = signal(false);

  search = signal('');
  sourceFilters = signal<string[]>([]);
  sort = signal<ItemSort>('name-asc');
  officialExpanded = signal(true);

  importing = signal(false);
  importMessage = signal<string | null>(null);
  importError = signal<string | null>(null);

  filteredItems    = computed(() => this.filter(this.items(), 'HOMEBREW'));
  filteredOfficial = computed(() => this.filter(this.officialItems(), 'XPHB'));
  itemsToPrint = computed(() => {
    const selected = this.selectedForPrint();
    return [...this.items(), ...this.officialItems()].filter(i => selected.has(i.index));
  });

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

  togglePrintMode() {
    this.printMode.update(v => !v);
    this.selectedForPrint.set(new Set());
  }

  isSelectedForPrint(item: DndItem): boolean {
    return this.selectedForPrint().has(item.index);
  }

  toggleSelectedForPrint(item: DndItem) {
    const set = new Set(this.selectedForPrint());
    if (set.has(item.index)) set.delete(item.index); else set.add(item.index);
    this.selectedForPrint.set(set);
  }

  openImageEditor(item: DndItem, event: Event) {
    event.stopPropagation();
    this.editingImageFor.set(item);
  }
  closeImageEditor() {
    this.editingImageFor.set(null);
  }

  async onImagePicked(icon: IconLibraryEntry) {
    const item = this.editingImageFor();
    if (!item) return;
    this.editingImageFor.set(null);
    const updated = await this.itemService.setImageOverride(item.index, icon.url);
    this.officialItems.update(items => items.map(i => i.index === updated.index ? updated : i));
  }

  async onImageReset() {
    const item = this.editingImageFor();
    if (!item) return;
    this.editingImageFor.set(null);
    const updated = await this.itemService.clearImageOverride(item.index);
    this.officialItems.update(items => items.map(i => i.index === updated.index ? updated : i));
  }

  openPrintView() {
    if (this.itemsToPrint().length === 0) return;
    this.showPrintView.set(true);
  }

  closePrintView() {
    this.showPrintView.set(false);
  }

  // Accepts either a bare array of items or `{ "items": [...] }` — the same shape a DM might
  // hand-author or get back from exporting a previous batch. Extra fields (e.g. a stale `index`
  // from a re-imported export) are silently dropped by the backend's DTO whitelist.
  async onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.importMessage.set(null);
    this.importError.set(null);
    this.importing.set(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { items?: unknown })?.items)
          ? (parsed as { items: unknown[] }).items
          : null;
      if (!items || items.length === 0) {
        throw new Error('Expected a JSON array of items, or an object with an "items" array.');
      }
      const created = await this.itemService.createItems(items as Omit<DndItem, 'index'>[]);
      this.importMessage.set(`Imported ${created.length} item${created.length === 1 ? '' : 's'}.`);
      await this.load();
    } catch (e) {
      if (e instanceof SyntaxError) {
        this.importError.set('That file isn\'t valid JSON.');
      } else {
        const message = e instanceof HttpErrorResponse ? (e.error?.message ?? e.message) : e instanceof Error ? e.message : 'Failed to import items.';
        this.importError.set(Array.isArray(message) ? message.join(', ') : message);
      }
    } finally {
      this.importing.set(false);
    }
  }
}
