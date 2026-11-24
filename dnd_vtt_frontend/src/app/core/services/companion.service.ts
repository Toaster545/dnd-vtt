import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';
import { CompanionResponse } from '../models/companion.model';

@Injectable({ providedIn: 'root' })
export class CompanionService {
  private http = inject(HttpClient);
  private sockets = inject(SocketService);
  get(id: string) {
    return firstValueFrom(
      this.http.get<CompanionResponse>(`${environment.apiUrl}/characters/${id}/companions`),
    );
  }
  create(id: string, body: Record<string, unknown>) {
    return firstValueFrom(
      this.http.post<CompanionResponse>(`${environment.apiUrl}/characters/${id}/companions`, body),
    );
  }
  update(characterId: string, id: string, body: Record<string, unknown>) {
    return firstValueFrom(
      this.http.post<CompanionResponse>(
        `${environment.apiUrl}/characters/${characterId}/companions/${id}`,
        body,
      ),
    );
  }
  watch(id: string, failed?: (error: unknown) => void): Observable<CompanionResponse> {
    return new Observable((observer) => {
      let live = true;
      let sequence = 0;
      const refresh = () => {
        const request = ++sequence;
        this.get(id).then(
          (value) => {
            if (live && sequence === request) observer.next(value);
          },
          (error) => {
            if (live && sequence === request) failed?.(error);
          },
        );
      };
      const changed = (event: { characterId: string }) => {
        if (event.characterId === id) refresh();
      };
      const socket = this.sockets.socket;
      socket.on('companions_updated', changed);
      socket.on('character_updated', changed);
      socket.on('turn_changed', refresh);
      socket.on('connect', refresh);
      this.sockets.connect();
      refresh();
      return () => {
        live = false;
        socket.off('companions_updated', changed);
        socket.off('character_updated', changed);
        socket.off('turn_changed', refresh);
        socket.off('connect', refresh);
      };
    });
  }
}
