import Konva from 'konva';
import { Measurement, MeasureShape } from '../../../core/models/campaign.model';

// Distance is snapped to grid intersections (rounded, not floored like token placement, so a
// drag that ends mid-square still reads as a clean whole-square distance) and assumes the 5e
// default of 1 square = 5 ft — this map has no per-map scale to read instead.
export const FEET_PER_SQUARE = 5;

export function snapToGrid(stage: Konva.Stage, cellSize: number): { col: number; row: number } {
  const pos = stage.getPointerPosition()!;
  return {
    col: Math.round(pos.x / cellSize),
    row: Math.round(pos.y / cellSize),
  };
}

function addMeasureLabel(layer: Konva.Layer, text: string, x: number, y: number) {
  layer.add(new Konva.Text({
    x, y, text, fontSize: 14, fontStyle: 'bold',
    fill: '#fff', offsetX: text.length * 3.5, offsetY: 20,
    shadowColor: '#000', shadowBlur: 4, shadowOpacity: 0.8,
  }));
}

function drawMeasurement(layer: Konva.Layer, cellSize: number, m: Measurement) {
  const ox = m.originCol * cellSize, oy = m.originRow * cellSize;
  const px = m.pointCol * cellSize, py = m.pointRow * cellSize;
  const dx = px - ox, dy = py - oy;
  const distancePx = Math.hypot(dx, dy);
  const squares = distancePx / cellSize;
  const feet = Math.round(squares * FEET_PER_SQUARE);
  const color = '#f5d67a';

  if (m.shape === 'line') {
    layer.add(new Konva.Line({ points: [ox, oy, px, py], stroke: color, strokeWidth: 3, lineCap: 'round' }));
    layer.add(new Konva.Circle({ x: ox, y: oy, radius: 4, fill: color }));
    layer.add(new Konva.Circle({ x: px, y: py, radius: 4, fill: color }));
    addMeasureLabel(layer, `${feet} ft`, (ox + px) / 2, (oy + py) / 2);
  } else if (m.shape === 'sphere') {
    layer.add(new Konva.Circle({
      x: ox, y: oy, radius: distancePx,
      stroke: color, strokeWidth: 2, fill: 'rgba(245, 214, 122, 0.15)',
    }));
    addMeasureLabel(layer, `${feet} ft`, ox, oy);
  } else {
    // Cone: apex at the origin, width at the far end equals the cone's length (the 5e
    // convention) — an isoceles triangle from the origin out to two points straddling the
    // drag point, offset perpendicular to the drag direction by half the length.
    const nx = -dy / distancePx, ny = dx / distancePx;
    const half = distancePx / 2;
    const leftX = px + nx * half, leftY = py + ny * half;
    const rightX = px - nx * half, rightY = py - ny * half;
    layer.add(new Konva.Line({
      points: [ox, oy, leftX, leftY, rightX, rightY],
      closed: true, stroke: color, strokeWidth: 2, fill: 'rgba(245, 214, 122, 0.15)',
    }));
    addMeasureLabel(layer, `${feet} ft`, px, py);
  }
}

// Owns the local (this viewer's in-progress drag, rendered instantly with no round trip) and
// remote (everyone else's live measurements, keyed by socket id) measurement state, and renders
// both to the measure layer. Never persisted — broadcast live only, same as fog paint strokes.
export class MeasurementTool {
  private local: Measurement | null = null;
  private remote = new Map<string, Measurement>();

  get current(): Measurement | null {
    return this.local;
  }

  begin(shape: MeasureShape, col: number, row: number) {
    this.local = { shape, originCol: col, originRow: row, pointCol: col, pointRow: row };
  }

  update(col: number, row: number) {
    if (!this.local) return;
    this.local = { ...this.local, pointCol: col, pointRow: row };
  }

  end() {
    this.local = null;
  }

  setRemote(senderId: string, measurement: Measurement | null) {
    if (measurement) this.remote.set(senderId, measurement);
    else this.remote.delete(senderId);
  }

  reset() {
    this.local = null;
    this.remote.clear();
  }

  render(layer: Konva.Layer, cellSize: number) {
    layer.destroyChildren();
    const all = [...this.remote.values()];
    if (this.local) all.push(this.local);
    for (const m of all) {
      if (m.originCol === m.pointCol && m.originRow === m.pointRow) continue;
      drawMeasurement(layer, cellSize, m);
    }
    layer.draw();
  }
}
