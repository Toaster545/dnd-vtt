import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Session } from '../models/session.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class SessionService {
  private http = inject(HttpClient);

  getAllForCampaign(campaignId: string): Promise<Session[]> {
    return firstValueFrom(this.http.get<Session[]>(`${API}/sessions`, { params: { campaignId } }));
  }

  getById(id: string): Promise<Session> {
    return firstValueFrom(this.http.get<Session>(`${API}/sessions/${id}`));
  }

  create(campaignId: string, name: string, description: string): Promise<Session> {
    return firstValueFrom(
      this.http.post<Session>(`${API}/sessions`, { campaign_id: campaignId, name, description }),
    );
  }

  update(id: string, patch: { description?: string; background_url?: string | null }): Promise<Session> {
    return firstValueFrom(this.http.patch<Session>(`${API}/sessions/${id}`, patch));
  }

  uploadBackground(id: string, file: File): Promise<Session> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(this.http.post<Session>(`${API}/sessions/${id}/background`, form));
  }

  setVisibility(id: string, visible: boolean): Promise<Session> {
    return firstValueFrom(this.http.patch<Session>(`${API}/sessions/${id}/visibility`, { visible }));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/sessions/${id}`));
  }
}
