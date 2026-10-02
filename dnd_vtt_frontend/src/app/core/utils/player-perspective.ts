import { MapLighting, MapToken } from '../models/campaign.model';

// Client-side mirror of the backend's serializePlayerTokens (maps/player-tokens.ts), for screens
// that show the players' view while signed in as the DM — the pop-out table view. The server
// hands a DM the full token list, so the hiding has to happen here: hidden tokens dropped, hidden
// names masked, monster HP/index and the DM-only movement plan stripped. Keep the two in sync.
export function tokensAsPlayersSee(tokens: MapToken[]): MapToken[] {
  return tokens
    .filter((token) => isVisibleToPlayers(token))
    .map((token) => {
      const nameVisible =
        token.name_visible_to_players !== false && (token.name_visible_to_players as unknown) !== 0;
      return {
        id: token.id,
        map_id: token.map_id,
        label: nameVisible ? token.label : 'Unknown',
        color: token.color,
        x: token.x,
        y: token.y,
        size: token.size,
        is_player: !!token.is_player,
        character_id: token.is_player ? token.character_id : undefined,
        // Monster art names the monster as plainly as its label, so it goes with the name.
        image_url:
          token.monster_index && nameVisible
            ? `/uploads/monster-tokens/${encodeURIComponent(token.monster_index)}.webp`
            : token.image_url,
        initiative: token.initiative ?? null,
        turn_start_x: token.turn_start_x ?? null,
        turn_start_y: token.turn_start_y ?? null,
        turn_anchor_x: token.turn_anchor_x ?? null,
        turn_anchor_y: token.turn_anchor_y ?? null,
        turn_moved_ft: token.turn_moved_ft ?? 0,
        turn_diagonals: token.turn_diagonals ?? 0,
      };
    });
}

// A DM payload carries the flag as a boolean or the raw 0/1 column; a player payload has already
// dropped hidden tokens and omits it.
function isVisibleToPlayers(token: MapToken): boolean {
  const flag = token.visible_to_players as unknown;
  return flag == null || (flag !== false && flag !== 0);
}

// Lights carried by a hidden token would give away where it stands, and light labels are DM
// notes — the same trimming the server applies to a player's lighting.
export function lightingAsPlayersSee(lighting: MapLighting, tokens: MapToken[]): MapLighting {
  const hiddenIds = new Set(tokens.filter((t) => !isVisibleToPlayers(t)).map((t) => t.id));
  return {
    ...lighting,
    lights: lighting.lights
      .filter((light) => !light.token_id || !hiddenIds.has(light.token_id))
      .map((light) => ({ ...light, label: '' })),
  };
}
