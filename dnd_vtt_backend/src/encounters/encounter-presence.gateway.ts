import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from '../common/database.service';
import { SocketAuthService } from '../auth/socket-auth.service';

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
  portraitSeed?: string;
}

// Tracks which players currently have an encounter open (for the DM's "Players" roster section) —
// purely in-memory/ephemeral, same as `TokensGateway`'s rooms; there's nothing to persist since
// "who's here right now" only means anything while sockets are actually connected.
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
export class EncounterPresenceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private presence = new Map<string, Map<string, PresentPlayer>>();

  constructor(
    private db: DatabaseService,
    private socketAuth: SocketAuthService,
  ) {}

  afterInit(server: Server) {
    this.socketAuth.install(server);
  }

  async handleConnection(client: Socket) {
    const user = this.socketAuth.user(client);
    const campaigns = await this.db.execute(
      `SELECT id FROM campaigns WHERE dm_id = ?
       UNION
       SELECT campaign_id AS id FROM campaign_members
       WHERE user_id = ? AND status = 'active'`,
      [user.id, user.id],
    );
    for (const row of campaigns.rows) {
      if (typeof row.id === 'string') void client.join(`campaign:${row.id}`);
    }
  }

  // DM side: join the room to receive broadcasts, without appearing in the roster themselves.
  @SubscribeMessage('watch_encounter_presence')
  async handleWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() encounterId: string,
  ) {
    await this.assertEncounterAccess(client, encounterId);
    await client.join(`encounter-presence:${encounterId}`);
    this.broadcast(encounterId);
  }

  // Player side: joining the room AND registering as present.
  @SubscribeMessage('announce_presence')
  async handleAnnounce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      encounterId: string;
      characterId: string;
    },
  ) {
    const user = this.socketAuth.user(client);
    const encounter = await this.assertEncounterAccess(
      client,
      data.encounterId,
      true,
    );
    const characterResult = await this.db.execute(
      `SELECT ch.*, p.username
       FROM campaign_members cm
       JOIN characters ch ON ch.id = cm.character_id
       JOIN profiles p ON p.id = cm.user_id
       WHERE cm.campaign_id = ? AND cm.user_id = ? AND cm.character_id = ?
         AND cm.status = 'active'`,
      [encounter.campaign_id, user.id, data.characterId],
    );
    const character = characterResult.rows[0];
    if (!character) throw new Error('Character is not active in this campaign');
    const characterData = this.db.parseJson<Record<string, unknown>>(
      character.data as string,
      {},
    );
    await client.join(`encounter-presence:${data.encounterId}`);
    (client.data as { presenceEncounterId?: string }).presenceEncounterId =
      data.encounterId;
    if (!this.presence.has(data.encounterId))
      this.presence.set(data.encounterId, new Map());
    this.presence.get(data.encounterId)!.set(client.id, {
      socketId: client.id,
      username: character.username as string,
      characterId: data.characterId,
      characterName: character.name as string,
      hp: Number(characterData.current_hp ?? 0),
      max_hp: Number(characterData.max_hp ?? 0),
      portraitSeed:
        typeof characterData.portrait_seed === 'string'
          ? characterData.portrait_seed
          : undefined,
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
    const encounterId = (
      client.data as { presenceEncounterId?: string } | undefined
    )?.presenceEncounterId;
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

  // DM advanced/reversed the current turn — pushed to the same room presence already tracks, so
  // both the DM's own other tabs and every joined player pick it up without a separate room/join.
  broadcastTurnState(
    encounterId: string,
    state: { current_turn_token_id: string | null; round_number: number },
  ) {
    this.server
      .to(`encounter-presence:${encounterId}`)
      .emit('turn_changed', state);
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
    this.server
      .to(`campaign:${payload.campaignId}`)
      .emit('encounter_started', payload);
  }

  private async assertEncounterAccess(
    client: Socket,
    encounterId: string,
    requireActive = false,
  ) {
    const user = this.socketAuth.user(client);
    const result = await this.db.execute(
      `SELECT e.*, s.campaign_id, s.visible_to_players AS session_visible,
              c.dm_id AS campaign_dm_id
       FROM encounters e
       JOIN sessions s ON s.id = e.session_id
       JOIN campaigns c ON c.id = s.campaign_id
       WHERE e.id = ?`,
      [encounterId],
    );
    const encounter = result.rows[0];
    if (!encounter) throw new Error('Encounter not found');
    if (encounter.campaign_dm_id === user.id) return encounter;
    const membership = await this.db.execute(
      `SELECT id FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
      [encounter.campaign_id, user.id],
    );
    if (
      !membership.rows[0] ||
      !encounter.session_visible ||
      !encounter.visible_to_players ||
      (requireActive && encounter.status !== 'active')
    ) {
      throw new Error('Forbidden');
    }
    return encounter;
  }
}
