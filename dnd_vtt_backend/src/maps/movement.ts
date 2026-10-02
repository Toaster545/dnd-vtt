// 1 square = 5 ft, matching the frontend's measurement tool and move-range overlay.
export const FEET_PER_SQUARE = 5;

// Cost of moving straight from one square to another under the PHB "Diagonal movement" optional
// rule the move-range overlay also uses (move-range-renderer.ts): orthogonal steps cost 5 ft and
// diagonal steps alternate 5 ft, 10 ft, ... — counted across the whole turn, so `diagonalsSoFar`
// carries over from the token's earlier moves this turn.
export function moveCost(
  from: { x: number; y: number },
  to: { x: number; y: number },
  diagonalsSoFar: number,
): { feet: number; diagonals: number } {
  const dx = Math.abs(Math.round(to.x - from.x));
  const dy = Math.abs(Math.round(to.y - from.y));
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;
  // Diagonal steps numbered diagonalsSoFar+1 .. diagonalsSoFar+diagonal; every even one costs 10.
  const doubled =
    Math.floor((diagonalsSoFar + diagonal) / 2) -
    Math.floor(diagonalsSoFar / 2);
  return {
    feet: (straight + diagonal + doubled) * FEET_PER_SQUARE,
    diagonals: diagonalsSoFar + diagonal,
  };
}
