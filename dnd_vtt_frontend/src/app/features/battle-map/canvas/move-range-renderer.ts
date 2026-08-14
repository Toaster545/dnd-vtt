import Konva from 'konva';
import { MapToken } from '../../../core/models/campaign.model';

const FEET_PER_SQUARE = 5;
const ORTHOGONAL: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// Tiles reachable from `token`'s current position this turn, highlighted whole-square rather than
// as a circle. Movement cost follows the PHB "Diagonal movement" optional rule: an orthogonal step
// always costs 5 ft, and diagonal steps alternate 5 ft, 10 ft, 5 ft, 10 ft, ... — the count of
// diagonal steps taken keeps building across the whole move even when orthogonal steps happen in
// between, it just doesn't advance on those orthogonal steps. Because a diagonal step's cost
// depends on how many diagonal steps preceded it *on that path*, the cheapest way to reach a given
// tile can differ by whether you arrive having taken an even or odd number of diagonal steps so
// far — so the search state is (col, row, diagonalParity), and a tile counts as reachable if
// either parity gets there within budget. No pathfinding/terrain: this app has no walls/obstacle
// model, so the only thing standing between the token and a tile is movement cost.
export function renderMoveRange(
  layer: Konva.Layer,
  cellSize: number,
  show: boolean,
  token: MapToken | null,
  rangeFt: number,
) {
  layer.destroyChildren();
  if (show && token && rangeFt > 0) {
    const startCol = Math.floor(token.x + token.size / 2);
    const startRow = Math.floor(token.y + token.size / 2);
    for (const [col, row] of reachableTiles(startCol, startRow, rangeFt)) {
      layer.add(new Konva.Rect({
        x: col * cellSize, y: row * cellSize, width: cellSize, height: cellSize,
        fill: token.color, opacity: 0.25,
      }));
    }
  }
  layer.draw();
}

function reachableTiles(startCol: number, startRow: number, rangeFt: number): [number, number][] {
  const key = (col: number, row: number) => `${col},${row}`;
  // Cheapest known cost to stand on a tile having just taken an even (0) or odd (1) count of
  // diagonal steps so far.
  const dist: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  dist[0].set(key(startCol, startRow), 0);

  interface Entry { col: number; row: number; parity: 0 | 1; cost: number }
  // Costs are only ever 5 or 10 ft and the frontier stays small (it can't grow past what `rangeFt`
  // affords), so a linear-scan priority queue is plenty here without pulling in a heap library.
  const frontier: Entry[] = [{ col: startCol, row: startRow, parity: 0, cost: 0 }];

  const relax = (col: number, row: number, parity: 0 | 1, newCost: number) => {
    if (col < 0 || row < 0 || newCost > rangeFt) return;
    const k = key(col, row);
    const known = dist[parity].get(k);
    if (known === undefined || newCost < known) {
      dist[parity].set(k, newCost);
      frontier.push({ col, row, parity, cost: newCost });
    }
  };

  while (frontier.length) {
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].cost < frontier[bestIdx].cost) bestIdx = i;
    }
    const { col, row, parity, cost } = frontier.splice(bestIdx, 1)[0];
    if (cost > dist[parity].get(key(col, row))!) continue; // superseded by a cheaper relax since

    for (const [dc, dr] of ORTHOGONAL) relax(col + dc, row + dr, parity, cost + FEET_PER_SQUARE);
    for (const [dc, dr] of DIAGONAL) {
      const stepCost = parity === 0 ? FEET_PER_SQUARE : FEET_PER_SQUARE * 2;
      relax(col + dc, row + dr, parity === 0 ? 1 : 0, cost + stepCost);
    }
  }

  const reached = new Set<string>();
  for (const m of dist) for (const k of m.keys()) reached.add(k);
  return [...reached].map((k) => {
    const [col, row] = k.split(',').map(Number);
    return [col, row] as [number, number];
  });
}
