import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';
import { BattleMap, MapToken } from '../models/campaign.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class BattleMapService {
  private http = inject(HttpClient);
  private socketService = inject(SocketService);

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
    await firstValueFrom(this.http.delete(`${API}/maps/${mapId}/tokens/${tokenId}`));
  }

  // WebSocket subscription for live token updates
  watchTokens(mapId: string): Observable<MapToken[]> {
    return new Observable(observer => {
      const socket = this.socketService.socket;

      this.getTokens(mapId).then(tokens => observer.next(tokens));

      socket.connect();
      socket.emit('join_map', mapId);
      socket.on('tokens_updated', (tokens: MapToken[]) => observer.next(tokens));

      return () => {
        socket.emit('leave_map', mapId);
        socket.off('tokens_updated');
        socket.disconnect();
      };
    });
  }
}
