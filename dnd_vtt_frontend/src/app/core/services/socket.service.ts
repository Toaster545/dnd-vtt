import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  // '/' connects to the current page origin — works both through the Angular
  // dev proxy (localhost:4200 → localhost:3000) and in production (same origin).
  readonly socket: Socket = io(environment.wsUrl, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
  });

  connect() { this.socket.connect(); }
  disconnect() { this.socket.disconnect(); }
}
