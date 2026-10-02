import { serializePlayerTokens } from './player-tokens';

describe('serializePlayerTokens', () => {
  const goblin = {
    id: 't1',
    map_id: 'm1',
    label: 'Goblin Warrior',
    color: '#c00',
    x: 1,
    y: 2,
    size: 1,
    is_player: 0,
    monster_index: 'goblin-warrior',
    visible_to_players: 1,
    name_visible_to_players: 1,
  };

  it('sends monster token art while the name is visible', () => {
    const [token] = serializePlayerTokens([goblin]);
    expect(token.image_url).toBe('/uploads/monster-tokens/goblin-warrior.webp');
    expect(token).not.toHaveProperty('monster_index');
  });

  it('withholds monster token art along with a hidden name', () => {
    const [token] = serializePlayerTokens([
      { ...goblin, name_visible_to_players: 0 },
    ]);
    expect(token.label).toBe('Unknown');
    expect(token.image_url).toBeUndefined();
  });
});
