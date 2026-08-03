import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContentService, DndSpell } from './content.service';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class SpellService {
  private http = inject(HttpClient);
  private content = inject(ContentService);

  // The DM's own library only — never the campaign-merged set getSpells() would return.
  async getMine(): Promise<DndSpell[]> {
    return firstValueFrom(this.http.get<DndSpell[]>(`${API}/content/spells/mine`));
  }

  // The server always assigns `index` on create, and defaults mechanics/source for whatever the
  // DM left blank — callers never supply an index and may omit source/most mechanics fields.
  async createSpell(spell: Partial<Omit<DndSpell, 'index'>>): Promise<DndSpell> {
    const created = await firstValueFrom(this.http.post<DndSpell>(`${API}/content/spells`, spell));
    this.content.invalidateContent('spells', created.index);
    return created;
  }

  async updateSpell(spell: Partial<DndSpell> & { index: string }): Promise<DndSpell> {
    const updated = await firstValueFrom(
      this.http.put<DndSpell>(`${API}/content/spells/${encodeURIComponent(spell.index)}`, spell)
    );
    this.content.invalidateContent('spells', updated.index);
    return updated;
  }

  async deleteSpell(index: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API}/content/spells/${encodeURIComponent(index)}`)
    );
    this.content.invalidateContent('spells', index);
  }
}
