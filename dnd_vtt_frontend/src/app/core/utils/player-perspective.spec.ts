import { MapLighting, MapToken } from '../models/campaign.model';
import { lightingAsPlayersSee, tokensAsPlayersSee } from './player-perspective';

function token(overrides: Partial<MapToken>): MapToken {
  return {
    id: 't1',
    map_id: 'm1',
    label: 'Goblin Boss',
    color: '#e74c3c',
    x: 2,
    y: 3,
    size: 1,
    is_player: false,
    ...overrides,
  };
}

describe('player perspective', () => {
  it('drops tokens hidden from players, whether flagged false or 0', () => {
    const tokens = [
      token({ id: 'shown', visible_to_players: true }),
      token({ id: 'hidden', visible_to_players: false }),
      token({ id: 'hidden-raw', visible_to_players: 0 as unknown as boolean }),
      token({ id: 'player-payload' }),
    ];
    expect(tokensAsPlayersSee(tokens).map((t) => t.id)).toEqual(['shown', 'player-payload']);
  });

  it('masks hidden names along with the monster art that would give them away', () => {
    const [masked, named] = tokensAsPlayersSee([
      token({ id: 'a', monster_index: 'goblin-boss', name_visible_to_players: false }),
      token({ id: 'b', monster_index: 'goblin-boss', name_visible_to_players: true }),
    ]);
    expect(masked.label).toBe('Unknown');
    expect(masked.image_url).toBeUndefined();
    expect(named.label).toBe('Goblin Boss');
    expect(named.image_url).toBe('/uploads/monster-tokens/goblin-boss.webp');
  });

  it('strips DM-only stats and keeps character ids only on player tokens', () => {
    const [monster, hero] = tokensAsPlayersSee([
      token({
        hp: 12,
        max_hp: 21,
        monster_index: 'goblin-boss',
        planned_x: 4,
        planned_y: 5,
        character_id: 'x',
      }),
      token({ id: 'h', is_player: true, character_id: 'c1' }),
    ]);
    expect(monster).not.toHaveProperty('hp');
    expect(monster).not.toHaveProperty('max_hp');
    expect(monster).not.toHaveProperty('monster_index');
    expect(monster).not.toHaveProperty('planned_x');
    expect(monster.character_id).toBeUndefined();
    expect(hero.character_id).toBe('c1');
  });

  it("drops lights carried by hidden tokens and blanks every light's label", () => {
    const lighting: MapLighting = {
      enabled: true,
      walls: [],
      lights: [
        {
          map_id: 'm1',
          token_id: 'hidden',
          bright_radius_ft: 20,
          dim_radius_ft: 40,
          color: '#fff',
          enabled: true,
          label: 'Ambush torch',
        },
        {
          map_id: 'm1',
          token_id: 'shown',
          bright_radius_ft: 20,
          dim_radius_ft: 40,
          color: '#fff',
          enabled: true,
          label: 'Torch',
        },
        {
          map_id: 'm1',
          x: 1,
          y: 1,
          bright_radius_ft: 10,
          dim_radius_ft: 20,
          color: '#fff',
          enabled: true,
          label: 'Brazier',
        },
      ],
    };
    const tokens = [
      token({ id: 'hidden', visible_to_players: false }),
      token({ id: 'shown', visible_to_players: true }),
    ];
    const seen = lightingAsPlayersSee(lighting, tokens);
    expect(seen.lights.map((l) => l.token_id ?? null)).toEqual(['shown', null]);
    expect(seen.lights.every((l) => l.label === '')).toBe(true);
  });
});
