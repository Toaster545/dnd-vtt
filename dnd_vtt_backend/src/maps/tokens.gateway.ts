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
import { serializePlayerTokens } from './player-tokens';

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
      .emit('tokens_updated', serializePlayerTokens(tokens));
    void this.notifyEncounterTokensChanged(mapId);
  }

  // An encounter's turn order spans all of its levels, so a token change on any one level map
  // nudges everyone in the encounter (DM and players alike, via EncounterPresenceGateway's
  // room) to refetch it — see EncountersService.findTurnOrder, which applies the player filter.
  private async notifyEncounterTokensChanged(mapId: string) {
    const encounters = await this.db.execute(
      `SELECT encounter_id FROM encounter_levels WHERE map_id = ?`,
      [mapId],
    );
    for (const row of encounters.rows) {
      const encounterId = row.encounter_id as string;
      this.server
        .to(`encounter-presence:${encounterId}`)
        .emit('encounter_tokens_changed', { encounterId });
    }
  }

  broadcastFog(mapId: string, fog: unknown) {
    this.server.to(`map:${mapId}:dm`).emit('fog_updated', fog);
    this.server.to(`map:${mapId}:player`).emit('fog_updated', fog);
  }

  broadcastFogCells(mapId: string, cells: string[], revealed: boolean) {
    this.server
      .to([`map:${mapId}:dm`, `map:${mapId}:player`])
      .emit('fog_cells', { cells, revealed });
  }

  async broadcastLighting<T extends { token_id?: string | null }>(
    mapId: string,
    lighting: { enabled: boolean; lights: T[]; walls: unknown[] },
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
      walls: lighting.walls,
    });
  }

  // A character's token was moved or removed — in a multi-level encounter, a player whose token
  // left the level they're shown falls back to the entry level (see EncountersService.findMyLevel). Sent to the
  // campaign room (every connected member joins it on connect, see EncounterPresenceGateway);
  // the owning player's client re-resolves its level, everyone else ignores it.
  notifyCharacterLevelChanged(campaignId: string, characterId: string) {
    this.server
      .to(`campaign:${campaignId}`)
      .emit('character_level_changed', { campaignId, characterId });
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
      `SELECT e.id FROM encounters e
       JOIN encounter_levels el ON el.encounter_id = e.id
       JOIN sessions s ON s.id = e.session_id
       WHERE el.map_id = ? AND s.campaign_id = ?
         AND e.visible_to_players = 1 AND s.visible_to_players = 1 LIMIT 1`,
      [mapId, map.campaign_id],
    );
    if (!membership.rows[0] || !visible.rows[0]) throw new Error('Forbidden');
    return 'player';
  }
}
