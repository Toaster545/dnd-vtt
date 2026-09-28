import Konva from 'konva';
import { MapWall } from '../../../core/models/campaign.model';
import { distanceToSegment, Point } from './visibility';

// How close (in cells) the pointer has to be to a wall for the eraser to pick it.
const ERASE_PICK_CELLS = 0.3;

// Pointer position in fractional grid units. Snaps to the nearest grid intersection — walls
// almost always run along cell edges — unless `free` (Shift held), for maps whose drawn walls
// don't line up with the grid.
export function wallPointUnderPointer(
  stage: Konva.Stage,
  cellSize: number,
  free: boolean,
): Point | null {
  const pos = stage.getRelativePointerPosition();
  if (!pos || !cellSize) return null;
  const x = pos.x / cellSize;
  const y = pos.y / cellSize;
  return free ? { x, y } : { x: Math.round(x), y: Math.round(y) };
}

// Index of the wall nearest `p` (grid units) within pick range, or -1.
export function wallIndexNear(walls: MapWall[], p: Point): number {
  let best = -1;
  let bestDist = ERASE_PICK_CELLS;
  walls.forEach((w, i) => {
    const d = distanceToSegment(p, { a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 } });
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

// Click-to-chain wall drawing: each click drops a vertex, and every vertex after the first
// commits a wall from the previous one, so a room's outline is one continuous run of clicks.
// Right-click, Escape or a double-click ends the chain. Holds only the in-progress chain and
// hover state; the committed wall list itself lives in the component's `lighting` signal.
export class WallTool {
  private chainStart: Point | null = null;
  private hover: Point | null = null;
  private eraseHoverIndex = -1;

  get isChaining(): boolean {
    return this.chainStart !== null;
  }

  reset() {
    this.chainStart = null;
    this.hover = null;
    this.eraseHoverIndex = -1;
  }

  // Returns the wall this click completes, if any (the first click of a chain completes none;
  // a click on the same point as the previous vertex is ignored, which is also what swallows
  // the second click of a double-click).
  addVertex(p: Point): MapWall | null {
    const start = this.chainStart;
    this.chainStart = p;
    if (!start || (start.x === p.x && start.y === p.y)) return null;
    return { x1: start.x, y1: start.y, x2: p.x, y2: p.y };
  }

  endChain() {
    this.chainStart = null;
  }

  setHover(p: Point | null) {
    this.hover = p;
  }

  setEraseHover(index: number) {
    this.eraseHoverIndex = index;
  }

  // DM-only overlay: every wall as a line, plus the rubber-band segment from the last vertex to
  // the pointer while chaining and a red highlight on the wall the eraser would remove. Drawn as
  // one Konva.Shape (not a node per wall) — a .dd2vtt import can bring in thousands of them.
  render(layer: Konva.Layer, walls: MapWall[], cellSize: number, visible: boolean) {
    layer.destroyChildren();
    if (visible && cellSize) {
      const chainStart = this.chainStart;
      const hover = this.hover;
      const eraseIndex = this.eraseHoverIndex;
      const lineWidth = Math.max(2, cellSize * 0.06);
      layer.add(
        new Konva.Shape({
          listening: false,
          sceneFunc: (context) => {
            context.save();
            context.lineCap = 'round';
            context.lineWidth = lineWidth;
            context.strokeStyle = '#c084fc';
            context.beginPath();
            walls.forEach((w, i) => {
              if (i === eraseIndex) return;
              context.moveTo(w.x1 * cellSize, w.y1 * cellSize);
              context.lineTo(w.x2 * cellSize, w.y2 * cellSize);
            });
            context.stroke();

            const erasing = walls[eraseIndex];
            if (erasing) {
              context.strokeStyle = '#ef4444';
              context.lineWidth = lineWidth * 1.8;
              context.beginPath();
              context.moveTo(erasing.x1 * cellSize, erasing.y1 * cellSize);
              context.lineTo(erasing.x2 * cellSize, erasing.y2 * cellSize);
              context.stroke();
            }

            if (chainStart && hover) {
              context.strokeStyle = 'rgba(192,132,252,0.6)';
              context.lineWidth = lineWidth;
              context.setLineDash([lineWidth * 3, lineWidth * 2]);
              context.beginPath();
              context.moveTo(chainStart.x * cellSize, chainStart.y * cellSize);
              context.lineTo(hover.x * cellSize, hover.y * cellSize);
              context.stroke();
              context.setLineDash([]);
            }

            // Vertex markers: the chain's anchor point, and where the next click would land.
            context.fillStyle = '#c084fc';
            for (const p of [chainStart, hover]) {
              if (!p) continue;
              context.beginPath();
              context.arc(p.x * cellSize, p.y * cellSize, lineWidth * 1.5, 0, Math.PI * 2);
              context.fill();
            }
            context.restore();
          },
        }),
      );
    }
    layer.draw();
  }
}
