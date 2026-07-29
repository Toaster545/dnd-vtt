import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';
import { BattleMap, MapToken, Measurement } from '../models/campaign.model';

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

  async rerollInitiative(mapId: string, tokenId: string): Promise<MapToken> {
    return firstValueFrom(
      this.http.post<MapToken>(`${API}/maps/${mapId}/tokens/${tokenId}/reroll-initiative`, {})
    );
  }

  // WebSocket subscription for live token updates
  watchTokens(mapId: string): Observable<MapToken[]> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      // Named so `off` below only removes this subscription's own listener — `socket` is a
      // singleton shared with other live features (e.g. encounter presence), so tearing down one
      // subscriber must never disconnect it or drop another subscriber's listeners wholesale.
      const handleUpdate = (tokens: MapToken[]) => observer.next(tokens);

      this.getTokens(mapId).then(tokens => observer.next(tokens));

      socket.connect();
      socket.emit('join_map', mapId);
      socket.on('tokens_updated', handleUpdate);

      return () => {
        socket.emit('leave_map', mapId);
        socket.off('tokens_updated', handleUpdate);
      };
    });
  }

  // Fire-and-forget — broadcasts the local drag to everyone else viewing this map. `null` clears
  // it (drag released / tool deselected).
  sendMeasure(mapId: string, measurement: Measurement | null): void {
    this.socketService.socket.emit('measure', { mapId, measurement });
  }

  // WebSocket subscription for other viewers' live measurements, keyed by their socket id so
  // several people can measure at once without clobbering each other.
  watchMeasurements(mapId: string): Observable<{ senderId: string; measurement: Measurement | null }> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleUpdate = (event: { senderId: string; measurement: Measurement | null }) => observer.next(event);

      socket.connect();
      socket.on('measure', handleUpdate);

      return () => {
        socket.off('measure', handleUpdate);
      };
    });
  }
}
