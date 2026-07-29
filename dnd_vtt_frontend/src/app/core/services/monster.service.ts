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

  async getMonsters(): Promise<DndMonster[]> {
    return firstValueFrom(this.http.get<DndMonster[]>(`${API}/content/monsters`));
  }

  async createMonster(monster: DndMonster): Promise<DndMonster> {
    const created = await firstValueFrom(this.http.post<DndMonster>(`${API}/content/monsters`, monster));
    this.content.invalidateMonster(created.index);
    return created;
  }

  async updateMonster(monster: DndMonster): Promise<DndMonster> {
    const updated = await firstValueFrom(
      this.http.put<DndMonster>(`${API}/content/monsters/${monster.index}`, monster)
    );
    this.content.invalidateMonster(updated.index);
    return updated;
  }
}
