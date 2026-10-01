import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import type { Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';
import { BattleMap, MapFog, MapLight, MapLighting, MapToken, MapWall, Measurement } from '../models/campaign.model';

interface FogCellsDelta { cells: string[]; revealed: boolean; }

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class BattleMapService {
  private http = inject(HttpClient);
  private socketService = inject(SocketService);

  // Joins `map:${mapId}` and re-joins (plus re-fetches canonical state, in case something changed
  // while disconnected) on every connect — including reconnects. socket.io does not persist
  // server-side room membership across a dropped/reconnected transport, so without this, any
  // network blip, a backgrounded tab waking back up, or a backend restart silently drops the
  // client out of the room: listeners stay attached and look "connected," but no more broadcasts
  // ever arrive (tokens/fog/lighting freeze) until the page is hard-refreshed. Returns the
  // `'connect'` listener so the caller can `off()` it on teardown.
  private joinMapRoom(socket: Socket, mapId: string, onRejoin: () => void): () => void {
    const rejoin = () => { socket.emit('join_map', mapId); onRejoin(); };
    socket.on('connect', rejoin);
    this.socketService.connect();
    if (socket.connected) rejoin();
    return rejoin;
  }

  async getMapsForCampaign(campaignId: string): Promise<BattleMap[]> {
    return firstValueFrom(this.http.get<BattleMap[]>(`${API}/maps?campaignId=${campaignId}`));
  }

  async getMap(mapId: string): Promise<BattleMap> {
    return firstValueFrom(this.http.get<BattleMap>(`${API}/maps/${mapId}`));
  }

  async getMapImage(imageUrl: string): Promise<Blob> {
    return firstValueFrom(this.http.get(imageUrl, { responseType: 'blob' }));
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

  // Narrower than upsertToken: lets a player recolor their own character's token without the
  // DM-only map-mutation access upsertToken requires (see MapsService.setTokenColor).
  async setTokenColor(mapId: string, tokenId: string, color: string): Promise<MapToken> {
    return firstValueFrom(
      this.http.post<MapToken>(`${API}/maps/${mapId}/tokens/${tokenId}/color`, { color })
    );
  }

  // Moves a token to another map of the campaign — another level of a multi-level encounter.
  async moveTokenToMap(token: MapToken, targetMapId: string): Promise<MapToken> {
    return firstValueFrom(
      this.http.post<MapToken>(`${API}/maps/${token.map_id}/tokens/${token.id}/move`, { target_map_id: targetMapId })
    );
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

      const rejoin = this.joinMapRoom(socket, mapId, () => {
        this.getTokens(mapId).then(tokens => observer.next(tokens));
      });
      socket.on('tokens_updated', handleUpdate);

      return () => {
        socket.emit('leave_map', mapId);
        socket.off('connect', rejoin);
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
  watchMeasurements(): Observable<{ senderId: string; measurement: Measurement | null }> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleUpdate = (event: { senderId: string; measurement: Measurement | null }) => observer.next(event);

      this.socketService.connect();
      socket.on('measure', handleUpdate);

      return () => {
        socket.off('measure', handleUpdate);
      };
    });
  }

  async getFog(mapId: string): Promise<MapFog> {
    return firstValueFrom(this.http.get<MapFog>(`${API}/maps/${mapId}/fog`));
  }

  async setFogEnabled(mapId: string, enabled: boolean): Promise<MapFog> {
    return firstValueFrom(
      this.http.post<MapFog>(`${API}/maps/${mapId}/fog/toggle`, { enabled })
    );
  }

  async paintFog(mapId: string, cells: { col: number; row: number }[], revealed: boolean): Promise<MapFog> {
    return firstValueFrom(
      this.http.post<MapFog>(`${API}/maps/${mapId}/fog/paint`, { cells, revealed })
    );
  }

  async resetFog(mapId: string): Promise<MapFog> {
    return firstValueFrom(this.http.post<MapFog>(`${API}/maps/${mapId}/fog/reset`, {}));
  }

  // WebSocket subscription for live fog updates — same join/leave-the-map-room lifecycle as
  // watchTokens; joining/leaving the same room twice (once per subscriber) is a harmless no-op.
  // Brush/rect paints arrive as per-cell `fog_cells` deltas; toggle/reset send the full state.
  // Deltas that land before the (re)join fetch resolves are queued and replayed on top of it —
  // add/delete per cell is idempotent, so replaying one the fetch already includes is harmless.
  watchFog(mapId: string): Observable<MapFog> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      let current: MapFog | null = null;
      let pending: FogCellsDelta[] = [];

      const applyDelta = (fog: MapFog, { cells, revealed }: FogCellsDelta): MapFog => {
        const hidden = new Set(fog.hidden_cells);
        for (const key of cells) {
          if (revealed) hidden.delete(key);
          else hidden.add(key);
        }
        return { ...fog, hidden_cells: [...hidden] };
      };
      const emitFull = (fog: MapFog) => {
        current = pending.reduce(applyDelta, fog);
        pending = [];
        observer.next(current);
      };
      const handleUpdate = (fog: MapFog) => emitFull(fog);
      const handleCells = (delta: FogCellsDelta) => {
        if (!current) {
          pending.push(delta);
          return;
        }
        current = applyDelta(current, delta);
        observer.next(current);
      };

      const rejoin = this.joinMapRoom(socket, mapId, () => {
        current = null;
        this.getFog(mapId).then(emitFull);
      });
      socket.on('fog_updated', handleUpdate);
      socket.on('fog_cells', handleCells);

      return () => {
        socket.emit('leave_map', mapId);
        socket.off('connect', rejoin);
        socket.off('fog_updated', handleUpdate);
        socket.off('fog_cells', handleCells);
      };
    });
  }

  async getLighting(mapId: string): Promise<MapLighting> {
    return firstValueFrom(this.http.get<MapLighting>(`${API}/maps/${mapId}/lighting`));
  }

  async setLightingEnabled(mapId: string, enabled: boolean): Promise<MapLighting> {
    return firstValueFrom(
      this.http.post<MapLighting>(`${API}/maps/${mapId}/lighting/toggle`, { enabled })
    );
  }

  async upsertLight(mapId: string, light: Partial<MapLight>): Promise<MapLight> {
    return firstValueFrom(
      this.http.post<MapLight>(`${API}/maps/${mapId}/lighting/lights`, light)
    );
  }

  // Replaces the map's entire wall set; the resulting lighting state comes back and is also
  // broadcast to every viewer via lighting_updated.
  async setWalls(mapId: string, walls: MapWall[]): Promise<MapLighting> {
    return firstValueFrom(
      this.http.put<MapLighting>(`${API}/maps/${mapId}/lighting/walls`, { walls })
    );
  }

  async deleteLight(mapId: string, lightId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${API}/maps/${mapId}/lighting/lights/${lightId}`)
    );
  }

  // WebSocket subscription for live lighting updates — same join/leave-the-map-room lifecycle as
  // watchFog/watchTokens; independent of fog, its own socket event.
  watchLighting(mapId: string): Observable<MapLighting> {
    return new Observable(observer => {
      const socket = this.socketService.socket;
      const handleUpdate = (lighting: MapLighting) => observer.next(lighting);

      const rejoin = this.joinMapRoom(socket, mapId, () => {
        this.getLighting(mapId).then(lighting => observer.next(lighting));
      });
      socket.on('lighting_updated', handleUpdate);

      return () => {
        socket.emit('leave_map', mapId);
        socket.off('connect', rejoin);
        socket.off('lighting_updated', handleUpdate);
      };
    });
  }
}
