import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContentService, DndMonster } from './content.service';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class MonsterService {
  private http = inject(HttpClient);
  private content = inject(ContentService);

  // The DM's own library only — never the campaign-merged set getMonsters() would return.
  async getMine(): Promise<DndMonster[]> {
    return firstValueFrom(this.http.get<DndMonster[]>(`${API}/content/monsters/mine`));
  }

  // The server always assigns `index` on create — callers never supply one.
  async createMonster(monster: Omit<DndMonster, 'index'>): Promise<DndMonster> {
    const created = await firstValueFrom(this.http.post<DndMonster>(`${API}/content/monsters`, monster));
    this.content.invalidateContent('monsters', created.index);
    return created;
  }

  async updateMonster(monster: DndMonster): Promise<DndMonster> {
    const updated = await firstValueFrom(
      this.http.put<DndMonster>(`${API}/content/monsters/${encodeURIComponent(monster.index)}`, monster)
    );
    this.content.invalidateContent('monsters', updated.index);
    return updated;
  }

  async deleteMonster(index: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API}/content/monsters/${encodeURIComponent(index)}`)
    );
    this.content.invalidateContent('monsters', index);
  }
}
