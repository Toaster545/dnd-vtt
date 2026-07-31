import { Component, inject, signal, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MonsterService } from '../../../core/services/monster.service';
import { DndMonster } from '../../../core/services/content.service';
import { MonsterFormComponent } from './monster-form/monster-form';

@Component({
  selector: 'app-dm-monsters',
  imports: [MonsterFormComponent, MatIconModule],
  templateUrl: './dm-monsters.html',
})
export class DmMonstersComponent implements OnInit {
  private monsterService = inject(MonsterService);

  monsters        = signal<DndMonster[]>([]);
  loading         = signal(true);
  showForm        = signal(false);
  editingMonster  = signal<DndMonster | null>(null);

  async ngOnInit() { await this.load(); }

  private async load() {
    this.loading.set(true);
    this.monsters.set(await this.monsterService.getMonsters());
    this.loading.set(false);
  }

  openCreate() { this.editingMonster.set(null); this.showForm.set(true); }
  openEdit(monster: DndMonster) { this.editingMonster.set(monster); this.showForm.set(true); }

  async onSaved() {
    this.showForm.set(false);
    await this.load();
  }
  onCancelled() { this.showForm.set(false); }
}
