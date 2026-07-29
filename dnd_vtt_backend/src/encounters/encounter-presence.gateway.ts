import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface PresentPlayer {
  socketId: string;
  username: string;
  characterId: string;
  characterName: string;
  // Self-reported by the announcing player's own client (same trust level as that player already
  // editing their own sheet) — lets fellow players see each other's HP on the map without opening
  // up character reads across accounts the way the DM's admin-only endpoint does.
  hp?: number;
  max_hp?: number;
}

// Tracks which players currently have an encounter open (for the DM's "Players" roster section) —
// purely in-memory/ephemeral, same as `TokensGateway`'s rooms; there's nothing to persist since
// "who's here right now" only means anything while sockets are actually connected.
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' },
})
export class EncounterPresenceGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private presence = new Map<string, Map<string, PresentPlayer>>();

  // DM side: join the room to receive broadcasts, without appearing in the roster themselves.
  @SubscribeMessage('watch_encounter_presence')
  handleWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() encounterId: string,
  ) {
    client.join(`encounter-presence:${encounterId}`);
    this.broadcast(encounterId);
  }

  // Player side: joining the room AND registering as present.
  @SubscribeMessage('announce_presence')
  handleAnnounce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      encounterId: string;
      username: string;
      characterId: string;
      characterName: string;
      hp?: number;
      max_hp?: number;
    },
  ) {
    client.join(`encounter-presence:${data.encounterId}`);
    client.data.presenceEncounterId = data.encounterId;
    if (!this.presence.has(data.encounterId))
      this.presence.set(data.encounterId, new Map());
    this.presence.get(data.encounterId)!.set(client.id, {
      socketId: client.id,
      username: data.username,
      characterId: data.characterId,
      characterName: data.characterName,
      hp: data.hp,
      max_hp: data.max_hp,
    });
    this.broadcast(data.encounterId);
  }

  @SubscribeMessage('leave_presence')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() encounterId: string,
  ) {
    this.removePresence(client.id, encounterId);
  }

  // Safety net for a closed tab/dropped connection that never got to emit `leave_presence`.
  handleDisconnect(client: Socket) {
    const encounterId = client.data?.presenceEncounterId as string | undefined;
    if (encounterId) this.removePresence(client.id, encounterId);
  }

  private removePresence(socketId: string, encounterId: string) {
    if (!this.presence.get(encounterId)?.delete(socketId)) return;
    this.broadcast(encounterId);
  }

  private broadcast(encounterId: string) {
    const players = [...(this.presence.get(encounterId)?.values() ?? [])];
    this.server
      .to(`encounter-presence:${encounterId}`)
      .emit('encounter_players_updated', players);
  }

  // Global broadcast (no room) so any connected player's client can decide for itself whether the
  // encounter belongs to one of their own campaigns and surface a "join now" alert — this app is
  // single-server/self-hosted at a small scale (see CLAUDE.md), so there's no need for per-campaign
  // socket rooms just to avoid a broadcast reaching clients that will simply ignore it.
  notifyEncounterStarted(payload: {
    encounterId: string;
    sessionId: string;
    campaignId: string;
    name: string;
  }) {
    this.server.emit('encounter_started', payload);
  }
}
