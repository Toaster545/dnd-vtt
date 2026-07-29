import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface Measurement {
  shape: 'line' | 'cone' | 'sphere';
  originCol: number;
  originRow: number;
  pointCol: number;
  pointRow: number;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' },
})
export class TokensGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  @SubscribeMessage('join_map')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() mapId: string) {
    void client.join(`map:${mapId}`);
  }

  @SubscribeMessage('leave_map')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() mapId: string) {
    void client.leave(`map:${mapId}`);
  }

  broadcastTokens(mapId: string, tokens: unknown[]) {
    this.server.to(`map:${mapId}`).emit('tokens_updated', tokens);
  }

  broadcastFog(mapId: string, fog: unknown) {
    this.server.to(`map:${mapId}`).emit('fog_updated', fog);
  }

  // Ephemeral ruler/cone/sphere measurements — never persisted, purely relayed to everyone else
  // currently viewing the same map (already in `map:${mapId}` via join_map above). `measurement:
  // null` means the sender released the drag; relayed as-is so viewers clear it too. Tracked on
  // `client.data` (not derived from `client.rooms`) so handleDisconnect below can clean up a
  // stuck ruler left by a dropped connection — same reasoning as EncounterPresenceGateway's own
  // disconnect handler.
  @SubscribeMessage('measure')
  handleMeasure(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { mapId: string; measurement: Measurement | null },
  ) {
    const socketData = client.data as { measuringMapId?: string };
    if (data.measurement) socketData.measuringMapId = data.mapId;
    else delete socketData.measuringMapId;
    client.to(`map:${data.mapId}`).emit('measure', {
      senderId: client.id,
      measurement: data.measurement,
    });
  }

  handleDisconnect(client: Socket) {
    const mapId = (client.data as { measuringMapId?: string } | undefined)
      ?.measuringMapId;
    if (mapId) {
      this.server
        .to(`map:${mapId}`)
        .emit('measure', { senderId: client.id, measurement: null });
    }
  }
}
