import Konva from 'konva';
import { MapToken } from '../../../core/models/campaign.model';
import { moveCostFt } from './turn-trail-renderer';

export interface PlanMarker {
  token: MapToken;
  x: number;
  y: number;
}

// The destination a player picked for their token: a dashed outline of the square(s) the token
// would cover, a dotted line from the token to it, and how far that is. On the DM's screen
// (`onAccept` set) clicking it moves the token there.
export function renderPlanMarker(
  layer: Konva.Layer, cellSize: number, plan: PlanMarker | null, onAccept?: () => void,
) {
  layer.destroyChildren();
  if (plan && cellSize && (plan.x !== plan.token.x || plan.y !== plan.token.y)) {
    drawMarker(layer, cellSize, plan, onAccept);
  }
  layer.draw();
}

function drawMarker(layer: Konva.Layer, cellSize: number, plan: PlanMarker, onAccept?: () => void) {
  const { token } = plan;
  const side = cellSize * token.size;
  const r = side / 2;
  const fromX = token.x * cellSize + r;
  const fromY = token.y * cellSize + r;
  const toX = plan.x * cellSize + r;
  const toY = plan.y * cellSize + r;
  // Mid-turn the diagonal count carries over from moves already made (see moveCostFt).
  const diagonals = token.turn_start_x != null ? token.turn_diagonals ?? 0 : 0;
  const feet = moveCostFt(token, plan, diagonals);

  layer.add(new Konva.Line({
    points: [fromX, fromY, toX, toY], listening: false,
    stroke: token.color, strokeWidth: 2, dash: [2, 6], lineCap: 'round', opacity: 0.9,
  }));

  const marker = new Konva.Group({ x: plan.x * cellSize, y: plan.y * cellSize });
  marker.add(new Konva.Rect({
    width: side, height: side, cornerRadius: 4,
    fill: token.color, opacity: 0.2,
  }));
  marker.add(new Konva.Rect({
    width: side, height: side, cornerRadius: 4,
    stroke: token.color, strokeWidth: 2, dash: [6, 4],
  }));
  marker.add(new Konva.Circle({ x: r, y: r, radius: Math.max(3, r * 0.15), fill: token.color }));

  const text = onAccept ? `${token.label} → ${feet} ft · click to move` : `Planned · ${feet} ft`;
  const label = new Konva.Label({ x: r, y: side + 2 });
  label.add(new Konva.Tag({
    fill: 'rgba(20, 18, 14, 0.8)', cornerRadius: 3, pointerDirection: 'up', pointerWidth: 8,
    pointerHeight: 4,
  }));
  label.add(new Konva.Text({
    text, fontSize: Math.max(11, Math.min(13, r * 0.4)), fontStyle: 'bold', fontFamily: 'Arial',
    padding: 3, fill: '#ede9df',
  }));
  marker.add(label);

  if (onAccept) {
    marker.on('click tap', e => {
      e.cancelBubble = true;
      onAccept();
    });
    marker.on('mouseenter', () => { layer.getStage()!.container().style.cursor = 'pointer'; });
    marker.on('mouseleave', () => { layer.getStage()!.container().style.cursor = ''; });
  } else {
    marker.listening(false);
  }
  layer.add(marker);
}
