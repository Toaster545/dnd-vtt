import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Session } from '../models/session.model';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class SessionService {
  private http = inject(HttpClient);

  getAll(): Promise<Session[]> {
    return firstValueFrom(this.http.get<Session[]>(`${API}/sessions`));
  }

  create(name: string, description: string): Promise<Session> {
    return firstValueFrom(this.http.post<Session>(`${API}/sessions`, { name, description }));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/sessions/${id}`));
  }
}
