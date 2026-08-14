import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MonsterService } from '../../../core/services/monster.service';
import { ContentService, DndContentSource, DndMonster } from '../../../core/services/content.service';
import { ConfirmService } from '../../../shared/confirm.service';
import { MonsterFormComponent } from './monster-form/monster-form';

@Component({
  selector: 'app-dm-monsters',
  imports: [MonsterFormComponent, MatIconModule, FormsModule],
  templateUrl: './dm-monsters.html',
})
export class DmMonstersComponent implements OnInit {
  private monsterService = inject(MonsterService);
  private content = inject(ContentService);
  private confirm = inject(ConfirmService);

  monsters        = signal<DndMonster[]>([]);
  officialMonsters = signal<DndMonster[]>([]);
  sources          = signal<DndContentSource[]>([]);
  loading         = signal(true);
  showForm        = signal(false);
  editingMonster  = signal<DndMonster | null>(null);
  duplicatingMonster = signal<DndMonster | null>(null);

  search = signal('');
  sourceFilter = signal('all');
  officialExpanded = signal(false);

  filteredMonsters = computed(() => this.filter(this.monsters(), 'HOMEBREW'));
  filteredOfficial = computed(() => this.filter(this.officialMonsters(), 'XPHB'));

  async ngOnInit() { await this.load(); }

  private filter(list: DndMonster[], fallbackSource: string): DndMonster[] {
    const q = this.search().trim().toLowerCase();
    const source = this.sourceFilter();
    return list.filter(monster =>
      (!q || monster.name.toLowerCase().includes(q)) &&
      (source === 'all' || (monster.source?.code ?? fallbackSource) === source),
    );
  }

  onSearchChange(v: string) {
    this.search.set(v);
    if (v.trim()) this.officialExpanded.set(true);
  }

  private async load() {
    this.loading.set(true);
    // Own library (editable) + the static SRD set (read-only reference) — the campaign-merged
    // set players/encounters actually use lives behind getMonsters(campaignId), separately.
    const [mine, official, sources] = await Promise.all([
      this.monsterService.getMine(),
      this.content.getMonsters(),
      this.content.getSources(),
    ]);
    this.monsters.set(mine);
    this.officialMonsters.set(official);
    this.sources.set(sources);
    this.loading.set(false);
  }

  openCreate() {
    this.editingMonster.set(null);
    this.duplicatingMonster.set(null);
    this.showForm.set(true);
  }
  openEdit(monster: DndMonster) {
    this.editingMonster.set(monster);
    this.duplicatingMonster.set(null);
    this.showForm.set(true);
  }
  openDuplicate(monster: DndMonster, event: Event) {
    event.stopPropagation();
    this.editingMonster.set(null);
    this.duplicatingMonster.set(monster);
    this.showForm.set(true);
  }

  async onSaved() {
    this.showForm.set(false);
    await this.load();
  }
  onCancelled() { this.showForm.set(false); }

  async onDelete(monster: DndMonster, event: Event) {
    event.stopPropagation();
    const ok = await this.confirm.confirm(`Delete "${monster.name}"? This can't be undone.`, 'Delete monster');
    if (!ok) return;
    await this.monsterService.deleteMonster(monster.index);
    await this.load();
  }
}
