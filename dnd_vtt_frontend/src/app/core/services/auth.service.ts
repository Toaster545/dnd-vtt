import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../models/user.model';
import { AuthTokenService, SessionResponse } from './auth-token.service';
import { SocketService } from './socket.service';

export type AuthReady = Promise<void>;

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private tokens = inject(AuthTokenService);
  private sockets = inject(SocketService);

  private _profile = signal<UserProfile | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  readonly isLoggedIn = computed(() => !!this._profile());

  readonly ready: AuthReady;

  constructor() {
    if (environment.devBypass) {
      this.tokens.setAccessToken('dev');
      // Set a stub admin profile immediately so guards never block,
      // then replace it with real data from the backend in the background.
      this._profile.set({ id: 'dev', email: '', username: 'Dev DM', role: 'admin', created_at: '' });
      this.ready = Promise.resolve();
      this.loadProfile();
    } else {
      this.ready = this.restoreSession();
    }
  }

  async signUp(email: string, password: string, username: string) {
    await firstValueFrom(
      this.http.post(`${API}/auth/register`, { email, password, username })
    );
  }

  async signIn(email: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<SessionResponse>(`${API}/auth/login`, {
        email,
        password,
        client_type: this.tokens.isNative ? 'native' : 'web',
      })
    );
    await this.tokens.acceptSession(res);
    this._profile.set(res.profile);
    this.sockets.refreshAuthentication();
    return res;
  }

  async signOut() {
    const refreshToken = await this.tokens.nativeRefreshToken();
    try {
      await firstValueFrom(
        this.http.post(`${API}/auth/logout`, refreshToken ? { refresh_token: refreshToken } : {}),
      );
    } finally {
      this.sockets.disconnect();
      await this.tokens.clear();
    }
    this._profile.set(null);
    void this.router.navigate(['/auth/login']);
  }

  private async loadProfile(): Promise<void> {
    try {
      const profile = await firstValueFrom(
        this.http.get<UserProfile>(`${API}/auth/me`)
      );
      this._profile.set(profile);
    } catch {
      await this.tokens.clear();
    }
  }

  private async restoreSession(): Promise<void> {
    try {
      const session = await this.tokens.refresh();
      this._profile.set(session?.profile ?? null);
      if (session) this.sockets.refreshAuthentication();
    } catch {
      await this.tokens.clear();
      this._profile.set(null);
    }
  }
}
