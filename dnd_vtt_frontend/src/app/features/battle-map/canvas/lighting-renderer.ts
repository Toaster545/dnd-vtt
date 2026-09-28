import Konva from 'konva';
import { MapLight, MapLighting, MapToken } from '../../../core/models/campaign.model';
import { FEET_PER_SQUARE } from './measurement-tool';
import { Point, Segment, visibilityPolygon } from './visibility';

// A standalone light's x/y are fractional grid units (like the measure tool, not floored like
// tokens/fog cells); an attached light's x/y are always null — its position is derived from the
// token it's pinned to instead, so it can never drift out of sync as the token moves. Returns
// null when there's nothing to resolve (an attached light whose token hasn't loaded yet, or a
// malformed standalone light) — callers just skip that light for the frame.
export function resolveLightPosition(
  light: MapLight,
  tokens: MapToken[],
  cellSize: number,
): { x: number; y: number } | null {
  if (light.token_id) {
    const token = tokens.find(t => t.id === light.token_id);
    if (!token) return null;
    const r = (token.size * cellSize) / 2;
    const cx = token.x * cellSize + r;
    const cy = token.y * cellSize + r;
    // Nudged toward the token's bottom-left edge (like a torch held at chest height) instead of
    // dead center, so the marker reads as "carried by" the token rather than floating on top of
    // its label/HP badge. The darkness hole moves with it — same single resolved point for both.
    const offset = r * 0.75 * Math.SQRT1_2;
    return { x: cx - offset, y: cy + offset };
  }
  if (light.x == null || light.y == null) return null;
  return { x: light.x * cellSize, y: light.y * cellSize };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [255, 165, 66]; // fallback: default torch orange
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

// Darkness overlay — fully independent of fog of war (see MapLighting). Drawn as exactly one
// Konva.Shape (never one node per light) whose sceneFunc fills the whole map with a base darkness
// color, then punches a bright→dim→dark radial-gradient hole out of it per enabled light via
// `destination-out` compositing — the same "single canvas fill call" perf convention fog-tool.ts/
// drawGrid/token-renderer.ts already use. This layer must contain only this one shape: erasing via
// destination-out would eat any other content sharing the layer.
//
// After every light has punched its hole, a second pass tints each hole with that light's own
// `color` (a soft radial wash, source-over) — this is what makes a torch actually *emit* orange
// light instead of just revealing the map's true colors. Deliberately a second pass over the
// whole list rather than interleaved erase+tint per light: if two lights overlap, doing it inline
// would let light B's destination-out erase eat into light A's already-drawn tint. Skipped for
// lights with no persisted `id` — the ephemeral personal-darkvision light battle-map.ts splices
// in (see BattleMapComponent.personalDarkvisionLight) never has one, and darkvision has no color
// of its own; it just reveals shapes in shades of gray per the 5e rule.
//
// Walls: each light's hole and tint are clipped to that light's visibility polygon (see
// visibility.ts), so light stops at walls and rooms behind them stay dark. Darkvision goes
// through the same path, so a player can't see through walls with it either. The polygon is
// computed once per light per render and shared by both passes.
export function renderDarkness(
  layer: Konva.Layer,
  lighting: MapLighting,
  tokens: MapToken[],
  isAdmin: boolean,
  img: HTMLImageElement | undefined,
  gridSize: number,
  cellSize: number,
) {
  layer.destroyChildren();
  if (lighting.enabled && img && cellSize) {
    const cols = Math.ceil(img.width / gridSize);
    const rows = Math.ceil(img.height / gridSize);
    const width = cols * cellSize;
    const height = rows * cellSize;
    // Distinct hue from fog's rgba(215,220,225,0.4) tint so a DM can tell "seeing through
    // darkness" apart from "seeing through fog" when both overlays are active at once.
    const baseFill = isAdmin ? 'rgba(10,10,20,0.55)' : '#000';
    const lights = lighting.lights.filter(l => l.enabled);
    const wallSegments: Segment[] = (lighting.walls ?? []).map(w => ({
      a: { x: w.x1 * cellSize, y: w.y1 * cellSize },
      b: { x: w.x2 * cellSize, y: w.y2 * cellSize },
    }));
    // Resolved up front (position, outer radius, visibility polygon) so both passes below and
    // every redraw Konva does of this shape reuse the same ray-cast work.
    const resolved = lights.flatMap(light => {
      const pos = resolveLightPosition(light, tokens, cellSize);
      if (!pos) return [];
      const outerPx = ((light.bright_radius_ft + light.dim_radius_ft) / FEET_PER_SQUARE) * cellSize;
      if (outerPx <= 0) return [];
      return [{ light, pos, outerPx, clip: visibilityPolygon(pos, outerPx, wallSegments) }];
    });

    const darknessShape = new Konva.Shape({
      listening: false,
      width,
      height,
      sceneFunc: context => {
        context.save();
        context.fillStyle = baseFill;
        // Overshoot the map by a margin on every side. If the fill stopped exactly at the map
        // image's edge, then whenever that edge lands between screen pixels (letterbox offset,
        // zoom, rotation) both layers would only partially cover the border pixels, and the
        // anti-aliased half-darkness over half-image would show as a thin lit outline around
        // the map. The overshoot only ever lies over the black stage background, so it's invisible.
        const margin = Math.max(cellSize, 8);
        context.fillRect(-margin, -margin, width + margin * 2, height + margin * 2);

        context.globalCompositeOperation = 'destination-out';
        for (const { light, pos, outerPx, clip } of resolved) {
          const brightPx = (light.bright_radius_ft / FEET_PER_SQUARE) * cellSize;
          context.save();
          if (clip) clipTo(context, clip);
          // Fully erase through the bright radius, then a soft gradient back to zero erasure
          // (full darkness restored) at the outer edge of the dim radius.
          const brightStop = Math.min(1, brightPx / outerPx);
          const gradient = context.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, outerPx);
          gradient.addColorStop(0, 'rgba(0,0,0,1)');
          gradient.addColorStop(brightStop, 'rgba(0,0,0,1)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          context.beginPath();
          context.arc(pos.x, pos.y, outerPx, 0, Math.PI * 2);
          context.fillStyle = gradient;
          context.fill();
          context.restore();
        }

        context.globalCompositeOperation = 'source-over';
        for (const { light, pos, outerPx, clip } of resolved) {
          if (!light.id) continue;
          context.save();
          if (clip) clipTo(context, clip);
          const [r, g, b] = hexToRgb(light.color);
          const tint = context.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, outerPx);
          tint.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
          tint.addColorStop(1, `rgba(${r},${g},${b},0)`);
          context.beginPath();
          context.arc(pos.x, pos.y, outerPx, 0, Math.PI * 2);
          context.fillStyle = tint;
          context.fill();
          context.restore();
        }
        // save()/restore() above already scopes globalCompositeOperation back to source-over —
        // nothing downstream (hit-canvas painting, later shapes on other layers) inherits it.
        context.restore();
      },
    });
    layer.add(darknessShape);
  }
  layer.draw();
}

function clipTo(context: Konva.Context, polygon: Point[]) {
  context.beginPath();
  context.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) context.lineTo(polygon[i].x, polygon[i].y);
  context.closePath();
  context.clip();
}

export interface LightMarkerCallbacks {
  onLightClick: (light: MapLight) => void;
  onLightDragEnd: (light: MapLight, col: number, row: number) => void;
  onLightContextMenu: (light: MapLight) => void;
}

// Torch markers — small, so one Konva node per light is fine (same order of magnitude as
// tokens). Visible to every viewer (a lit torch is a physical thing anyone in the room can see),
// but only draggable/clickable/deletable when `interactive` (DM view) — players get the same
// marker rendered read-only (`listening: false`, no handlers attached) so it can't intercept
// clicks meant for a token/the map underneath it. Only standalone lights are draggable even in
// the DM view; an attached light's position is derived from its token, so dragging it wouldn't
// have anywhere to persist to. `hiddenCells` (players only, null otherwise) drops markers sitting
// on fogged cells — this layer is drawn above the fog so attached markers aren't covered by their
// token, so it has to do its own fog check, same as token-renderer's hiddenByFog.
export function renderLightMarkers(
  layer: Konva.Layer,
  lighting: MapLighting,
  tokens: MapToken[],
  cellSize: number,
  selectedLightId: string | null,
  interactive: boolean,
  hiddenCells: Set<string> | null,
  callbacks: LightMarkerCallbacks,
) {
  layer.destroyChildren();
  const radius = Math.max(6, cellSize * 0.12);
  for (const light of lighting.lights) {
    const pos = resolveLightPosition(light, tokens, cellSize);
    if (!pos) continue;
    if (hiddenCells?.has(`${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)}`)) continue;
    const isSelected = interactive && light.id === selectedLightId;

    const marker = new Konva.Shape({
      x: pos.x,
      y: pos.y,
      listening: interactive,
      draggable: interactive && !light.token_id,
      fill: light.color,
      hitFunc: interactive ? (context, shape) => {
        context.beginPath();
        context.arc(0, 0, radius + 3, 0, Math.PI * 2);
        context.closePath();
        context.fillStrokeShape(shape);
      } : undefined,
      sceneFunc: context => {
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.closePath();
        context.fillStyle = light.enabled ? light.color : 'rgba(120,120,120,0.6)';
        context.fill();
        context.lineWidth = isSelected ? 3 : 1.5;
        context.strokeStyle = isSelected ? '#f5d67a' : '#fff';
        context.stroke();
      },
    });
    marker.getSelfRect = () => ({
      x: -radius - 3, y: -radius - 3, width: (radius + 3) * 2, height: (radius + 3) * 2,
    });

    if (interactive) {
      marker.on('click tap', () => callbacks.onLightClick(light));
      marker.on('contextmenu', (e) => { e.evt.preventDefault(); callbacks.onLightContextMenu(light); });
      if (!light.token_id) {
        marker.on('dragend', () => {
          const p = marker.position();
          callbacks.onLightDragEnd(light, p.x / cellSize, p.y / cellSize);
        });
      }
    }
    layer.add(marker);
  }
  layer.draw();
}
