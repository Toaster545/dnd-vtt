import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);

  private _session = signal<Session | null>(null);
  private _profile = signal<UserProfile | null>(null);

  readonly session = this._session.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  readonly isLoggedIn = computed(() => !!this._session());

  constructor() {
    this.supabase.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
      if (data.session?.user) this.loadProfile(data.session.user);
    });

    this.supabase.auth.onAuthStateChange((_, session) => {
      this._session.set(session);
      if (session?.user) {
        this.loadProfile(session.user);
      } else {
        this._profile.set(null);
      }
    });
  }

  async signUp(email: string, password: string, username: string) {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await this.supabase.from('profiles').insert({
        id: data.user.id,
        email,
        username,
        role: 'player',
      });
      if (profileError) throw profileError;
    }

    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signOut() {
    await this.supabase.auth.signOut();
    this._profile.set(null);
    this.router.navigate(['/auth/login']);
  }

  private async loadProfile(user: User) {
    const { data } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    this._profile.set(data);
  }
}
