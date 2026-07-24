import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' },
})
export class TokensGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('join_map')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() mapId: string) {
    client.join(`map:${mapId}`);
  }

  @SubscribeMessage('leave_map')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() mapId: string) {
    client.leave(`map:${mapId}`);
  }

  broadcastTokens(mapId: string, tokens: unknown[]) {
    this.server.to(`map:${mapId}`).emit('tokens_updated', tokens);
  }
}
