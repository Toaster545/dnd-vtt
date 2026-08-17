import type { Server, Socket } from 'socket.io';
import { EncounterPresenceGateway } from './encounter-presence.gateway';

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
  function setup() {
    const emit = jest.fn();
    const gateway = new EncounterPresenceGateway();
    gateway.server = { to: jest.fn(() => ({ emit })) } as unknown as Server;
    const client = {
      id: 'socket-1',
      data: {},
      join: jest.fn(() => Promise.resolve()),
    } as unknown as Socket;
    return { gateway, client, emit };
  }

  it('normalizes a valid recipe before broadcasting it', () => {
    const { gateway, client, emit } = setup();
    gateway.handleAnnounce(client, {
      encounterId: 'encounter-1',
      username: 'Player',
      characterId: 'character-1',
      characterName: 'Aria',
      avatarRecipe: recipe(),
    });
    const players = broadcastPlayers(emit);
    expect(players[0].avatarRecipe).toEqual(recipe());
  });

  it('drops malformed recipes while retaining the legacy seed fallback', () => {
    const { gateway, client, emit } = setup();
    gateway.handleAnnounce(client, {
      encounterId: 'encounter-1',
      username: 'Player',
      characterId: 'character-1',
      characterName: 'Aria',
      portraitSeed: 'legacy',
      avatarRecipe: { rawSvg: '<script />' },
    });
    const players = broadcastPlayers(emit);
    expect(players[0].avatarRecipe).toBeUndefined();
    expect(players[0].portraitSeed).toBe('legacy');
  });
});
