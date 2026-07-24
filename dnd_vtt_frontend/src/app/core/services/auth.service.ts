import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../models/user.model';

export type AuthReady = Promise<void>;

const API = environment.apiUrl;

interface LoginResponse {
  access_token: string;
  profile: UserProfile;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private _profile = signal<UserProfile | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  readonly isLoggedIn = computed(() => !!this._profile());

  readonly ready: AuthReady;

  constructor() {
    if (environment.devBypass) {
      localStorage.setItem('auth_token', 'dev');
      // Set a stub admin profile immediately so guards never block,
      // then replace it with real data from the backend in the background.
      this._profile.set({ id: 'dev', email: '', username: 'Dev DM', role: 'admin', created_at: '' });
      this.ready = Promise.resolve();
      this.loadProfile();
    } else if (localStorage.getItem('auth_token')) {
      this.ready = this.loadProfile();
    } else {
      this.ready = Promise.resolve();
    }
  }

  async signUp(email: string, password: string, username: string) {
    await firstValueFrom(
      this.http.post(`${API}/auth/register`, { email, password, username })
    );
  }

  async signIn(email: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${API}/auth/login`, { email, password })
    );
    localStorage.setItem('auth_token', res.access_token);
    this._profile.set(res.profile);
    return res;
  }

  async signOut() {
    localStorage.removeItem('auth_token');
    this._profile.set(null);
    this.router.navigate(['/auth/login']);
  }

  private async loadProfile(): Promise<void> {
    try {
      const profile = await firstValueFrom(
        this.http.get<UserProfile>(`${API}/auth/me`)
      );
      this._profile.set(profile);
    } catch {
      localStorage.removeItem('auth_token');
    }
  }
}
