import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PlayerBootstrap } from '../models/player.model';

const API = environment.apiUrl;
const CHARACTER_KEY = 'player.selected-character-id';
const CAMPAIGN_KEY = 'player.selected-campaign-id';

@Injectable({ providedIn: 'root' })
export class PlayerContextService {
  private http = inject(HttpClient);
  readonly state = signal<PlayerBootstrap | null>(null);

  async load(): Promise<PlayerBootstrap> {
    let params = new HttpParams();
    const characterId = localStorage.getItem(CHARACTER_KEY);
    const campaignId = localStorage.getItem(CAMPAIGN_KEY);
    if (characterId) params = params.set('characterId', characterId);
    if (campaignId) params = params.set('campaignId', campaignId);
    const state = await firstValueFrom(this.http.get<PlayerBootstrap>(`${API}/player/bootstrap`, { params }));
    this.persistValidated(CHARACTER_KEY, state.selected_character_id);
    this.persistValidated(CAMPAIGN_KEY, state.selected_campaign_id);
    this.state.set(state);
    return state;
  }

  async selectCharacter(id: string): Promise<PlayerBootstrap> { localStorage.setItem(CHARACTER_KEY, id); return this.load(); }
  async selectCampaign(id: string): Promise<PlayerBootstrap> { localStorage.setItem(CAMPAIGN_KEY, id); return this.load(); }
  async clearCampaign(): Promise<PlayerBootstrap> { localStorage.removeItem(CAMPAIGN_KEY); return this.load(); }

  private persistValidated(key: string, id: string | null): void {
    if (id) localStorage.setItem(key, id); else localStorage.removeItem(key);
  }
}
