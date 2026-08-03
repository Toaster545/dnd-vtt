import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SpellService } from '../../../core/services/spell.service';
import { ContentService, DndSpell } from '../../../core/services/content.service';
import { ConfirmService } from '../../../shared/confirm.service';
import { SpellFormComponent } from './spell-form/spell-form';

@Component({
  selector: 'app-dm-spells',
  imports: [SpellFormComponent, MatIconModule, FormsModule],
  templateUrl: './dm-spells.html',
})
export class DmSpellsComponent implements OnInit {
  private spellService = inject(SpellService);
  private content = inject(ContentService);
  private confirm = inject(ConfirmService);

  spells         = signal<DndSpell[]>([]);
  officialSpells = signal<DndSpell[]>([]);
  loading        = signal(true);
  showForm       = signal(false);
  editingSpell   = signal<DndSpell | null>(null);
  duplicatingSpell = signal<DndSpell | null>(null);

  search = signal('');
  officialExpanded = signal(false);

  filteredSpells   = computed(() => this.filterByName(this.spells()));
  filteredOfficial = computed(() => this.filterByName(this.officialSpells()));

  async ngOnInit() { await this.load(); }

  private filterByName(list: DndSpell[]): DndSpell[] {
    const q = this.search().trim().toLowerCase();
    return q ? list.filter(s => s.name.toLowerCase().includes(q)) : list;
  }

  onSearchChange(v: string) {
    this.search.set(v);
    if (v.trim()) this.officialExpanded.set(true);
  }

  private async load() {
    this.loading.set(true);
    // Own library (editable) + the static SRD set (read-only reference) — the campaign-merged
    // set the character wizard/sheet actually use lives behind getSpells(campaignId), separately.
    const [mine, official] = await Promise.all([
      this.spellService.getMine(),
      this.content.getSpells(),
    ]);
    this.spells.set(mine);
    this.officialSpells.set(official);
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
