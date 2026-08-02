import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserProfile, UserRole } from '../models/user.model';

const API = environment.apiUrl;

export interface UpdateUserPayload {
  username?: string;
  email?: string;
  role?: UserRole;
  password?: string;
}

// Admin-only account management (see backend UsersController, gated by AdminGuard) — surfaced in
// the Settings page's Admin section, distinct from AuthService which only manages the caller's
// own profile.
@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private http = inject(HttpClient);

  getAll(): Promise<UserProfile[]> {
    return firstValueFrom(this.http.get<UserProfile[]>(`${API}/users`));
  }

  update(id: string, patch: UpdateUserPayload): Promise<UserProfile> {
    return firstValueFrom(this.http.patch<UserProfile>(`${API}/users/${id}`, patch));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/users/${id}`));
  }
}
