import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';
import { BattleMap, MapToken } from '../models/campaign.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class BattleMapService {
  private http = inject(HttpClient);
  // Supabase client kept only for Realtime subscriptions
  private supabase = inject(SupabaseService).client;

  async getAllMaps(): Promise<BattleMap[]> {
    return firstValueFrom(this.http.get<BattleMap[]>(`${API}/maps`));
  }

  async getMap(mapId: string): Promise<BattleMap> {
    return firstValueFrom(this.http.get<BattleMap>(`${API}/maps/${mapId}`));
  }

  async createMap(map: Partial<BattleMap>): Promise<BattleMap> {
    return firstValueFrom(this.http.post<BattleMap>(`${API}/maps`, map));
  }

  async uploadMapImage(file: File, campaignId: string): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await firstValueFrom(
      this.http.post<{ url: string }>(`${API}/maps/upload?campaignId=${campaignId}`, form)
    );
    return res.url;
  }

  async getTokens(mapId: string): Promise<MapToken[]> {
    return firstValueFrom(this.http.get<MapToken[]>(`${API}/maps/${mapId}/tokens`));
  }

  async upsertToken(token: MapToken): Promise<MapToken> {
    return firstValueFrom(
      this.http.post<MapToken>(`${API}/maps/${token.map_id}/tokens`, token)
    );
  }

  async deleteToken(tokenId: string, mapId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API}/maps/${mapId}/tokens/${tokenId}`)
    );
  }

  // Supabase Realtime for live token updates (read-only subscription)
  watchTokens(mapId: string): Observable<MapToken[]> {
    return new Observable(observer => {
      this.getTokens(mapId).then(tokens => observer.next(tokens));

      const channel = this.supabase
        .channel(`tokens:${mapId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'map_tokens', filter: `map_id=eq.${mapId}` },
          () => this.getTokens(mapId).then(tokens => observer.next(tokens))
        )
        .subscribe();

      return () => this.supabase.removeChannel(channel);
    });
  }
}
