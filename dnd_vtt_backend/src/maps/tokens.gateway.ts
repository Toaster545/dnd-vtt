import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from '../common/database.service';
import { SocketAuthService } from '../auth/socket-auth.service';

interface Measurement {
  shape: 'line' | 'cone' | 'sphere';
  originCol: number;
  originRow: number;
  pointCol: number;
  pointRow: number;
}

@WebSocketGateway({
  cors: {
    origin: (
      process.env.CORS_ORIGINS ??
      'http://localhost:4200,https://dnd.mathomelab.ca,https://localhost,capacitor://localhost'
    )
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  },
})
export class TokensGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private db: DatabaseService,
    private socketAuth: SocketAuthService,
  ) {}

  afterInit(server: Server) {
    this.socketAuth.install(server);
  }

  @SubscribeMessage('join_map')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() mapId: string,
  ) {
    const role = await this.mapRole(client, mapId);
    await client.join(`map:${mapId}:${role}`);
    return { joined: true, role };
  }

  @SubscribeMessage('leave_map')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() mapId: string) {
    void client.leave(`map:${mapId}:dm`);
    void client.leave(`map:${mapId}:player`);
  }

  broadcastTokens(mapId: string, tokens: Record<string, unknown>[]) {
    this.server.to(`map:${mapId}:dm`).emit('tokens_updated', tokens);
    this.server
      .to(`map:${mapId}:player`)
      .emit('tokens_updated', this.playerTokens(tokens));
  }

  broadcastFog(mapId: string, fog: unknown) {
    this.server.to(`map:${mapId}:dm`).emit('fog_updated', fog);
    this.server.to(`map:${mapId}:player`).emit('fog_updated', fog);
  }

  async broadcastLighting<T extends { token_id?: string | null }>(
    mapId: string,
    lighting: { enabled: boolean; lights: T[] },
  ) {
    this.server.to(`map:${mapId}:dm`).emit('lighting_updated', lighting);
    const tokens = await this.db.execute(
      `SELECT id FROM map_tokens WHERE map_id = ? AND visible_to_players = 1`,
      [mapId],
    );
    const visible = new Set(tokens.rows.map((row) => row.id));
    this.server.to(`map:${mapId}:player`).emit('lighting_updated', {
      enabled: lighting.enabled,
      lights: lighting.lights
        .filter((light) => !light.token_id || visible.has(light.token_id))
        .map((light) => ({ ...light, label: '' })),
    });
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
    if (!client.rooms.has(`map:${data.mapId}:dm`)) return;
    const socketData = client.data as { measuringMapId?: string };
    if (data.measurement) socketData.measuringMapId = data.mapId;
    else delete socketData.measuringMapId;
    client
      .to([`map:${data.mapId}:dm`, `map:${data.mapId}:player`])
      .emit('measure', {
        senderId: client.id,
        measurement: data.measurement,
      });
  }

  handleDisconnect(client: Socket) {
    const mapId = (client.data as { measuringMapId?: string } | undefined)
      ?.measuringMapId;
    if (mapId) {
      this.server
        .to([`map:${mapId}:dm`, `map:${mapId}:player`])
        .emit('measure', { senderId: client.id, measurement: null });
    }
  }

  private async mapRole(
    client: Socket,
    mapId: string,
  ): Promise<'dm' | 'player'> {
    const user = this.socketAuth.user(client);
    const mapResult = await this.db.execute(
      `SELECT campaign_id FROM battle_maps WHERE id = ?`,
      [mapId],
    );
    const map = mapResult.rows[0];
    if (!map) throw new Error('Map not found');
    const campaign = await this.db.execute(
      `SELECT dm_id FROM campaigns WHERE id = ?`,
      [map.campaign_id],
    );
    if (campaign.rows[0]?.dm_id === user.id) return 'dm';
    const membership = await this.db.execute(
      `SELECT id FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [map.campaign_id, user.id],
    );
    const visible = await this.db.execute(
      `SELECT e.id FROM encounters e JOIN sessions s ON s.id = e.session_id
       WHERE e.map_id = ? AND s.campaign_id = ?
         AND e.visible_to_players = 1 AND s.visible_to_players = 1 LIMIT 1`,
      [mapId, map.campaign_id],
    );
    if (!membership.rows[0] || !visible.rows[0]) throw new Error('Forbidden');
    return 'player';
  }

  private playerTokens(tokens: Record<string, unknown>[]) {
    return tokens
      .filter((token) => !!token.visible_to_players)
      .map((token) => ({
        id: token.id,
        map_id: token.map_id,
        label: token.name_visible_to_players ? token.label : 'Unknown',
        color: token.color,
        x: token.x,
        y: token.y,
        size: token.size,
        is_player: !!token.is_player,
        character_id: token.is_player ? token.character_id : undefined,
        initiative: token.initiative ?? null,
      }));
  }
}
