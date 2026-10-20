import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

// Uses the authenticated campaign rooms established by EncounterPresenceGateway.
// Payloads contain identifiers only; every refetch is access checked.
@WebSocketGateway()
export class CompanionsGateway {
  @WebSocketServer() server: Server;
  changed(
    campaignId: string | null | undefined,
    characterId: string,
    ownerResourcesChanged = false,
  ) {
    if (campaignId) {
      this.server
        ?.to(`campaign:${campaignId}`)
        .emit('companions_updated', { characterId });
      if (ownerResourcesChanged)
        this.server
          ?.to(`campaign:${campaignId}`)
          .emit('character_updated', { campaignId, characterId });
    }
  }
}
