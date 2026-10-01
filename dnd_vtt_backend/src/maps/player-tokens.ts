// What a player is allowed to see of a map's tokens: hidden tokens dropped, hidden names masked,
// DM-only combat stats (monster HP, monster index) stripped. Shared by every path that hands
// tokens to a player — REST, the per-map socket broadcast, and the encounter-wide turn order.
export function serializePlayerTokens(tokens: Record<string, unknown>[]) {
  return tokens
    .filter((token) => !!token.visible_to_players)
    .map((token) => ({
      id: token.id as string,
      map_id: token.map_id as string,
      label: token.name_visible_to_players ? token.label : 'Unknown',
      color: token.color,
      x: Number(token.x),
      y: Number(token.y),
      size: Number(token.size),
      is_player: !!token.is_player,
      character_id: token.is_player ? token.character_id : undefined,
      initiative: token.initiative ?? null,
      turn_start_x: token.turn_start_x ?? null,
      turn_start_y: token.turn_start_y ?? null,
      turn_anchor_x: token.turn_anchor_x ?? null,
      turn_anchor_y: token.turn_anchor_y ?? null,
      turn_moved_ft: Number(token.turn_moved_ft ?? 0),
      turn_diagonals: Number(token.turn_diagonals ?? 0),
    }));
}
