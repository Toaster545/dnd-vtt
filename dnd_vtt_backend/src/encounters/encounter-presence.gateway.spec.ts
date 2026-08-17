import type { Server, Socket } from 'socket.io';
import { EncounterPresenceGateway } from './encounter-presence.gateway';
import type { DatabaseService } from '../common/database.service';
import type { SocketAuthService } from '../auth/socket-auth.service';

interface BroadcastPlayer {
  avatarRecipe?: unknown;
  portraitSeed?: string;
}

function broadcastPlayers(emit: jest.Mock): BroadcastPlayer[] {
  const calls = emit.mock.calls as unknown as [string, BroadcastPlayer[]][];
  return calls.at(-1)?.[1] ?? [];
}

function recipe() {
  return {
    schemaVersion: 1,
    styleId: 'lorelei',
    styleVersion: 1,
    seed: 'presence-seed',
    parts: {
      face: ['variant01'],
      ears: [],
      eyes: ['variant01'],
      eyebrows: ['variant01'],
      nose: ['variant01'],
      mouth: ['happy01'],
      hair: ['variant01'],
      horns: [],
      facialHair: [],
      faceDetails: [],
      scars: [],
      tattoos: [],
      piercings: [],
      accessories: [],
    },
    colors: {
      skin: '#ffffff',
      hair: '#000000',
      eyes: '#000000',
      eyebrows: '#000000',
      mouth: '#000000',
      details: '#000000',
      piercings: '#000000',
      accessories: '#000000',
    },
  };
}

describe('EncounterPresenceGateway avatar recipes', () => {
  function setup(characterData: Record<string, unknown>) {
    const emit = jest.fn();
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'campaign-1',
            campaign_dm_id: 'dm-1',
            session_visible: 1,
            visible_to_players: 1,
            status: 'active',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'membership-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'character-1',
            name: 'Aria',
            username: 'Player',
            data: JSON.stringify(characterData),
          },
        ],
      });
    const db = {
      execute,
      parseJson: (value: string) =>
        JSON.parse(value) as Record<string, unknown>,
    } as unknown as DatabaseService;
    const socketAuth = {
      user: jest.fn(() => ({ id: 'player-1', role: 'player' })),
      install: jest.fn(),
    } as unknown as SocketAuthService;
    const gateway = new EncounterPresenceGateway(db, socketAuth);
    gateway.server = { to: jest.fn(() => ({ emit })) } as unknown as Server;
    const client = {
      id: 'socket-1',
      data: {},
      join: jest.fn(() => Promise.resolve()),
    } as unknown as Socket;
    return { gateway, client, emit };
  }

  it('normalizes a valid server-stored recipe before broadcasting it', async () => {
    const avatarRecipe = recipe();
    const { gateway, client, emit } = setup({
      current_hp: 8,
      max_hp: 12,
      avatar_recipe: avatarRecipe,
    });
    await gateway.handleAnnounce(client, {
      encounterId: 'encounter-1',
      characterId: 'character-1',
    });
    const players = broadcastPlayers(emit);
    expect(players[0].avatarRecipe).toEqual(avatarRecipe);
  });

  it('drops malformed stored recipes while retaining the legacy seed fallback', async () => {
    const { gateway, client, emit } = setup({
      portrait_seed: 'legacy',
      avatar_recipe: { rawSvg: '<script />' },
    });
    await gateway.handleAnnounce(client, {
      encounterId: 'encounter-1',
      characterId: 'character-1',
    });
    const players = broadcastPlayers(emit);
    expect(players[0].avatarRecipe).toBeUndefined();
    expect(players[0].portraitSeed).toBe('legacy');
  });
});
