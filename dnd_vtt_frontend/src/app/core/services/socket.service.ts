import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  readonly socket: Socket = io(environment.wsUrl, { autoConnect: false });

  connect() { this.socket.connect(); }
  disconnect() { this.socket.disconnect(); }
}
