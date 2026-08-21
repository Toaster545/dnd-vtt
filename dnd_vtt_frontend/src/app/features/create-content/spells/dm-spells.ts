import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SpellService } from '../../../core/services/spell.service';
import { ContentService, DndContentSource, DndSpell } from '../../../core/services/content.service';
import { ConfirmService } from '../../../shared/confirm.service';
import { SpellFormComponent } from './spell-form/spell-form';
import { ContentDetailDialogComponent } from '../content-detail-dialog/content-detail-dialog';
import { ContentSourceFilterComponent } from '../content-source-filter/content-source-filter';

type SpellSort = 'name-asc' | 'name-desc' | 'source-asc' | 'level-asc' | 'level-desc';

@Component({
  selector: 'app-dm-spells',
  imports: [SpellFormComponent, ContentDetailDialogComponent, ContentSourceFilterComponent, MatIconModule, FormsModule],
  templateUrl: './dm-spells.html',
})
export class DmSpellsComponent implements OnInit {
  private spellService = inject(SpellService);
  private content = inject(ContentService);
  private confirm = inject(ConfirmService);

  spells         = signal<DndSpell[]>([]);
  officialSpells = signal<DndSpell[]>([]);
  sources        = signal<DndContentSource[]>([]);
  loading        = signal(true);
  showForm       = signal(false);
  editingSpell   = signal<DndSpell | null>(null);
  duplicatingSpell = signal<DndSpell | null>(null);
  detailSpell = signal<DndSpell | null>(null);

  search = signal('');
  sourceFilters = signal<string[]>([]);
  sort = signal<SpellSort>('name-asc');
  accessFilter = signal('all');
  officialExpanded = signal(true);

  filteredSpells   = computed(() => this.filter(this.spells(), 'HOMEBREW'));
  filteredOfficial = computed(() => this.filter(this.officialSpells(), 'XPHB'));
  accessOptions = computed(() => {
    const options = new Map<string, string>();
    for (const spell of [...this.spells(), ...this.officialSpells()]) {
      for (const access of spell.access ?? []) {
        const key = `${access.kind}:${access.provider_index}`;
        const label = access.parent_name
          ? `${access.parent_name} — ${access.provider_name}`
          : access.provider_name;
        options.set(key, label);
      }
    }
    return [...options].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  });

  async ngOnInit() { await this.load(); }

  private filter(list: DndSpell[], fallbackSource: string): DndSpell[] {
    const q = this.search().trim().toLowerCase();
    const sources = this.sourceFilters();
    const access = this.accessFilter();
    const filtered = list.filter(spell =>
      (!q || spell.name.toLowerCase().includes(q)) &&
      (sources.length === 0 || sources.includes(spell.source?.code ?? fallbackSource)) &&
      (access === 'all' || (spell.access ?? []).some(entry => `${entry.kind}:${entry.provider_index}` === access)),
    );
    return filtered.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      switch (this.sort()) {
        case 'name-desc': return -byName;
        case 'source-asc': return (a.source?.book ?? fallbackSource).localeCompare(b.source?.book ?? fallbackSource) || byName;
        case 'level-asc': return a.level - b.level || byName;
        case 'level-desc': return b.level - a.level || byName;
        default: return byName;
      }
    });
  }

  setSourceFilters(codes: string[]) { this.sourceFilters.set(codes); }

  onSearchChange(v: string) {
    this.search.set(v);
    if (v.trim()) this.officialExpanded.set(true);
  }

  accessLabel(spell: DndSpell): string {
    const names = [...new Set((spell.access ?? []).map(access => access.provider_name))];
    if (names.length === 0) return 'No providers';
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
  }

  private async load() {
    this.loading.set(true);
    // Own library (editable) + the static SRD set (read-only reference) — the campaign-merged
    // set the character wizard/sheet actually use lives behind getSpells(campaignId), separately.
    const [mine, official, sources] = await Promise.all([
      this.spellService.getMine(),
      this.content.getSpells(),
      this.content.getSources(),
    ]);
    this.spells.set(mine);
    this.officialSpells.set(official);
    this.sources.set(sources);
    this.loading.set(false);
  }

  openCreate() {
    this.editingSpell.set(null);
    this.duplicatingSpell.set(null);
    this.showForm.set(true);
  }
  openEdit(spell: DndSpell) {
    this.editingSpell.set(spell);
    this.duplicatingSpell.set(null);
    this.showForm.set(true);
  }
  openDetails(spell: DndSpell) { this.detailSpell.set(spell); }
  closeDetails() { this.detailSpell.set(null); }
  openDuplicate(spell: DndSpell, event: Event) {
    event.stopPropagation();
    this.editingSpell.set(null);
    this.duplicatingSpell.set(spell);
    this.showForm.set(true);
  }

  async onSaved() {
    this.showForm.set(false);
    await this.load();
  }
  onCancelled() { this.showForm.set(false); }

  async onDelete(spell: DndSpell, event: Event) {
    event.stopPropagation();
    const ok = await this.confirm.confirm(`Delete "${spell.name}"? This can't be undone.`, 'Delete spell');
    if (!ok) return;
    await this.spellService.deleteSpell(spell.index);
    await this.load();
  }
}
