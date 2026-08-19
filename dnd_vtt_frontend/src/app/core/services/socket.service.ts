import { Injectable, effect, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from './auth-token.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private tokens = inject(AuthTokenService);
  // '/' connects to the current page origin — works both through the Angular
  // dev proxy (localhost:4200 → localhost:3000) and in production (same origin).
  readonly socket: Socket = io(environment.wsUrl, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
  });
  constructor() {
    effect(() => {
      this.socket.auth = { token: this.tokens.accessToken() };
      if (this.socket.connected) this.socket.disconnect().connect();
    });
  }

  connect() {
    this.socket.auth = { token: this.tokens.accessToken() };
    this.socket.connect();
  }
  disconnect() { this.socket.disconnect(); }

  refreshAuthentication() {
    this.socket.auth = { token: this.tokens.accessToken() };
    if (this.socket.connected) {
      this.socket.disconnect().connect();
    }
  }
}
