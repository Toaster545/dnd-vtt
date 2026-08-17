import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../models/user.model';

const NATIVE_REFRESH_KEY = 'dnd.refresh-session';
const API = environment.apiUrl;

export interface SessionResponse {
  access_token: string;
  refresh_token?: string;
  refresh_expires_at: string;
  client_type: 'web' | 'native';
  profile: UserProfile;
}

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private readonly access = signal<string | null>(null);
  private refreshInFlight?: Promise<SessionResponse | null>;

  readonly accessToken = this.access.asReadonly();
  readonly isNative = Capacitor.isNativePlatform();

  setAccessToken(token: string | null): void {
    this.access.set(token);
  }

  async acceptSession(session: SessionResponse): Promise<void> {
    this.access.set(session.access_token);
    if (this.isNative && session.refresh_token) {
      await SecureStorage.set(NATIVE_REFRESH_KEY, session.refresh_token);
    }
  }

  refresh(): Promise<SessionResponse | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  async clear(): Promise<void> {
    this.access.set(null);
    if (this.isNative) await SecureStorage.remove(NATIVE_REFRESH_KEY);
  }

  async nativeRefreshToken(): Promise<string | undefined> {
    if (!this.isNative) return undefined;
    const value = await SecureStorage.get(NATIVE_REFRESH_KEY);
    return typeof value === 'string' ? value : undefined;
  }

  private async performRefresh(): Promise<SessionResponse | null> {
    const nativeToken = await this.nativeRefreshToken();
    if (this.isNative && !nativeToken) return null;
    const response = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nativeToken ? { refresh_token: nativeToken } : {}),
    });
    if (!response.ok) {
      await this.clear();
      return null;
    }
    const session = (await response.json()) as SessionResponse;
    await this.acceptSession(session);
    return session;
  }
}
