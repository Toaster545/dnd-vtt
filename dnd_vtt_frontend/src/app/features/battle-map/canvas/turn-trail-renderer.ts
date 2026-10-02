import Konva from 'konva';
import { MapFog, MapToken } from '../../../core/models/campaign.model';
import { FEET_PER_SQUARE } from './measurement-tool';

// Mirrors the backend's moveCost (dnd_vtt_backend/src/maps/movement.ts) so a drag in progress
// can preview the distance the server will record on drop: orthogonal steps cost 5 ft, diagonal
// steps alternate 5/10 ft counted across the whole turn (the move-range overlay's rule).
export function moveCostFt(
  from: { x: number; y: number }, to: { x: number; y: number }, diagonalsSoFar: number,
): number {
  const dx = Math.abs(Math.round(to.x - from.x));
  const dy = Math.abs(Math.round(to.y - from.y));
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;
  const doubled = Math.floor((diagonalsSoFar + diagonal) / 2) - Math.floor(diagonalsSoFar / 2);
  return (straight + diagonal + doubled) * FEET_PER_SQUARE;
}

export interface TurnTrailContext {
  cellSize: number;
  fog: MapFog;
  isAdmin: boolean;
}

// A drag in progress: the token's live center in pixels and the square it would drop on.
export interface TrailDrag {
  xPx: number;
  yPx: number;
  col: number;
  row: number;
}

export interface Trail {
  // As last saved by the server — not the live mid-drag position.
  token: MapToken;
  drag?: TrailDrag;
  // Only for the viewer's own token: shown as "moved / speed", in red once it's over.
  speedFt: number | null;
  // DM only: shown as buttons beside the token while it has an unconfirmed move.
  onConfirm?: () => void;
  onUndo?: () => void;
}

// Each trail: the token's starting point this turn (a faded ghost), a dashed line from there to
// where it is now, and the distance it has traveled so far. A token that isn't taking its turn
// can still get one while being dragged, measured from where it was picked up (see
// BattleMapComponent.renderTrail).
export function renderTurnTrails(layer: Konva.Layer, trails: Trail[], ctx: TurnTrailContext) {
  layer.destroyChildren();
  if (ctx.cellSize) {
    for (const trail of trails) {
      const { token } = trail;
      // The squares the token will occupy if dropped now — mostly for Large and bigger tokens,
      // whose landing spot isn't obvious from the cursor alone.
      if (trail.drag) {
        const side = token.size * ctx.cellSize;
        layer.add(new Konva.Rect({
          x: trail.drag.col * ctx.cellSize, y: trail.drag.row * ctx.cellSize,
          width: side, height: side, listening: false,
          fill: 'rgba(245, 214, 122, 0.18)', stroke: '#f5d67a', strokeWidth: 2, dash: [6, 4],
        }));
      }
      if (token.turn_start_x == null || token.turn_start_y == null) continue;
      drawTrail(layer, trail, { x: token.turn_start_x, y: token.turn_start_y }, ctx);
    }
  }
  layer.draw();
}

function drawTrail(
  layer: Konva.Layer, { token, drag, speedFt, onConfirm, onUndo }: Trail,
  start: { x: number; y: number }, ctx: TurnTrailContext,
) {
  const { cellSize } = ctx;
  // The last square the DM confirmed; a move from there only counts once confirmed (see
  // MapsService.confirmTokenMove).
  const anchor = token.turn_anchor_x != null && token.turn_anchor_y != null
    ? { x: token.turn_anchor_x, y: token.turn_anchor_y }
    : start;
  const at = drag ? { x: drag.col, y: drag.row } : { x: token.x, y: token.y };
  // Same rule as the token renderer's fog check: an enemy's trail through hidden squares would
  // give away where it is (or was) to players.
  if (!ctx.isAdmin && ctx.fog.enabled && !token.is_player) {
    const hidden = new Set(ctx.fog.hidden_cells);
    if ([start, anchor, at].some(p => hidden.has(`${p.x},${p.y}`))) return;
  }

  const confirmedFt = token.turn_moved_ft ?? 0;
  const pendingFt = at.x !== anchor.x || at.y !== anchor.y
    ? moveCostFt(anchor, at, token.turn_diagonals ?? 0)
    : 0;
  const r = (cellSize * token.size) / 2;
  const center = (p: { x: number; y: number }) => [p.x * cellSize + r, p.y * cellSize + r];
  const [startCx, startCy] = center(start);
  const [anchorCx, anchorCy] = center(anchor);
  const [endCx, endCy] = drag ? [drag.xPx, drag.yPx] : center(token);
  const away = Math.hypot(endCx - startCx, endCy - startCy) > 1;
  if (!away && confirmedFt === 0 && pendingFt === 0) return;

  if (away) {
    layer.add(new Konva.Circle({
      x: startCx, y: startCy, radius: r - 3, listening: false,
      fill: token.color, opacity: 0.35,
      stroke: '#fff', strokeWidth: 2, dash: [6, 4],
    }));
  }
  // Confirmed path: start → last confirmed square.
  if (anchorCx !== startCx || anchorCy !== startCy) {
    layer.add(new Konva.Line({
      points: [startCx, startCy, anchorCx, anchorCy], listening: false,
      stroke: '#f5d67a', strokeWidth: 3, dash: [10, 6], lineCap: 'round', opacity: 0.9,
    }));
  }
  // Pending move: last confirmed square → where the token is (or is being dragged) now.
  if (Math.hypot(endCx - anchorCx, endCy - anchorCy) > 1) {
    layer.add(new Konva.Line({
      points: [anchorCx, anchorCy, endCx, endCy], listening: false,
      stroke: '#ede9df', strokeWidth: 2, dash: [4, 6], lineCap: 'round', opacity: 0.8,
    }));
  }

  const totalFt = confirmedFt + pendingFt;
  const over = speedFt != null && totalFt > speedFt;
  const text = (pendingFt ? `${confirmedFt} (+${pendingFt})` : `${confirmedFt}`)
    + (speedFt != null ? ` / ${speedFt} ft` : ' ft');
  const fontSize = Math.max(11, Math.min(14, r * 0.45));
  const label = new Konva.Label({ x: endCx, y: endCy + r + 2, listening: false });
  label.add(new Konva.Tag({
    fill: 'rgba(20, 18, 14, 0.8)', cornerRadius: 3, pointerDirection: 'up', pointerWidth: 8,
    pointerHeight: 4,
  }));
  label.add(new Konva.Text({
    text, fontSize, fontStyle: 'bold', fontFamily: 'Arial', padding: 3,
    fill: over ? '#e05252' : '#f5d67a',
  }));
  layer.add(label);

  // Not mid-drag: the buttons would chase the cursor, and the drop isn't saved yet anyway.
  if (pendingFt && !drag && onConfirm && onUndo) {
    const y = endCy + r + 2 + label.height() + 4;
    const confirm = actionButton('✓ Confirm', '#4caf82', fontSize, onConfirm, layer);
    const undo = actionButton('↶ Undo', '#e05252', fontSize, onUndo, layer);
    const gap = 4;
    const total = confirm.width() + gap + undo.width();
    confirm.position({ x: endCx - total / 2, y });
    undo.position({ x: endCx - total / 2 + confirm.width() + gap, y });
    layer.add(confirm, undo);
  }
}

function actionButton(
  text: string, color: string, fontSize: number, onClick: () => void, layer: Konva.Layer,
): Konva.Label {
  const button = new Konva.Label();
  button.add(new Konva.Tag({ fill: 'rgba(20, 18, 14, 0.9)', stroke: color, strokeWidth: 1, cornerRadius: 3 }));
  button.add(new Konva.Text({
    text, fontSize, fontStyle: 'bold', fontFamily: 'Arial', padding: 4, fill: color,
  }));
  button.on('click tap', e => {
    e.cancelBubble = true;
    onClick();
  });
  button.on('mouseenter', () => { layer.getStage()!.container().style.cursor = 'pointer'; });
  button.on('mouseleave', () => { layer.getStage()!.container().style.cursor = ''; });
  return button;
}
