import {
  TokenBorder,
  TokenBorderMaterial,
  TokenBorderPattern,
  TokenPopOutRange,
} from '../models/token-border.model';

export const TOKEN_BORDER_MIN_WIDTH = 1;
export const TOKEN_BORDER_MAX_WIDTH = 10;
export const TOKEN_FACE_MIN_SCALE = 80;
export const TOKEN_FACE_MAX_SCALE = 150;
export const TOKEN_POP_OUT_MAX_RANGES = 6;

// Borders saved before thickness became a slider stored a named size instead.
const LEGACY_WIDTHS: Record<string, number> = { thin: 2, normal: 5, thick: 8 };

export const TOKEN_BORDER_PATTERNS: readonly { id: TokenBorderPattern; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'double', label: 'Double' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

export const TOKEN_BORDER_MATERIALS: readonly { id: TokenBorderMaterial; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'metal', label: 'Metal' },
  { id: 'studded', label: 'Studded' },
];

export const TOKEN_BORDER_PALETTE: readonly string[] = [
  '#c9a227',
  '#e5e7eb',
  '#9ca3af',
  '#e05252',
  '#f97316',
  '#eab308',
  '#4caf82',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#1f2937',
];

export const DEFAULT_TOKEN_BORDER: TokenBorder = {
  color: TOKEN_BORDER_PALETTE[0],
  width: 5,
  pattern: 'solid',
  gradientColor: null,
  bandColor: null,
  backgroundColor: null,
  material: 'flat',
  faceScale: 100,
  popOut: [{ start: 0, end: 180 }],
};

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function optionalHex(value: unknown): string | null | undefined {
  if (value == null) return null;
  return isHex(value) ? value.toLowerCase() : undefined;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function normalizePopOut(value: unknown): TokenPopOutRange[] | null {
  if (value === undefined) return DEFAULT_TOKEN_BORDER.popOut.map((range) => ({ ...range }));
  if (!Array.isArray(value) || value.length > TOKEN_POP_OUT_MAX_RANGES) return null;
  const ranges: TokenPopOutRange[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { start, end } = item as Record<string, unknown>;
    if (!inRange(start, 0, 360) || !inRange(end, 0, 360)) return null;
    ranges.push({ start, end });
  }
  return ranges;
}

// Fields added after the first version (band, background, material, face scale, pop-out) default
// when missing, so borders saved earlier keep working; a present-but-invalid value still rejects.
export function normalizeTokenBorder(value: unknown): TokenBorder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isHex(raw['color'])) return null;
  const width = typeof raw['width'] === 'string' ? LEGACY_WIDTHS[raw['width']] : raw['width'];
  if (!inRange(width, TOKEN_BORDER_MIN_WIDTH, TOKEN_BORDER_MAX_WIDTH)) return null;
  if (!TOKEN_BORDER_PATTERNS.some((option) => option.id === raw['pattern'])) return null;
  const material = raw['material'] ?? 'flat';
  if (!TOKEN_BORDER_MATERIALS.some((option) => option.id === material)) return null;
  const faceScale = raw['faceScale'] ?? 100;
  if (!inRange(faceScale, TOKEN_FACE_MIN_SCALE, TOKEN_FACE_MAX_SCALE)) return null;
  const popOut = normalizePopOut(raw['popOut']);
  if (!popOut) return null;
  const gradientColor = optionalHex(raw['gradientColor']);
  const bandColor = optionalHex(raw['bandColor']);
  const backgroundColor = optionalHex(raw['backgroundColor']);
  if (gradientColor === undefined || bandColor === undefined || backgroundColor === undefined) {
    return null;
  }
  return {
    color: raw['color'].toLowerCase(),
    width,
    pattern: raw['pattern'] as TokenBorderPattern,
    gradientColor,
    bandColor,
    backgroundColor,
    material: material as TokenBorderMaterial,
    faceScale,
    popOut,
  };
}

// Stroke width for a thickness level. Scales with the token (so a Large token's ring isn't a
// hairline, and the dialog preview matches the map), with a floor so a small token on a
// zoomed-out map still shows it. Level 5 is about the old fixed 3px ring on a typical token.
function lineWidthFor(r: number, level: number): number {
  return Math.max(0.8 + level * 0.3, r * level * 0.018);
}

interface Ring {
  radius: number;
  lineWidth: number;
}

// The ring(s) to stroke for a token of outer radius `r`. The outermost edge sits 1px inside `r`,
// so it never runs into the current-turn highlight drawn just outside the token.
function ringsFor(r: number, border: TokenBorder): Ring[] {
  const w = lineWidthFor(r, border.width);
  if (border.pattern === 'double') {
    const lineWidth = Math.max(1, w * 0.55);
    const outer = r - 1 - lineWidth / 2;
    return [
      { radius: outer, lineWidth },
      { radius: outer - lineWidth * 2, lineWidth },
    ];
  }
  return [{ radius: r - 1 - w / 2, lineWidth: w }];
}

// Radius to clip the portrait (or plain color fill) to, so it meets the outer ring's center line
// with no sliver of map showing between face and ring.
export function tokenBorderInnerRadius(r: number, border: TokenBorder): number {
  return ringsFor(r, border)[0].radius;
}

// Paints the token's face — background color, then the portrait at its zoom, clipped to the
// ring's inner circle. `fallbackFill` stands in for the art while it hasn't loaded yet.
// `faceR` defaults to the ring-inset radius, but a caller with no ring to inset for (a plain
// portrait icon — see TokenBorderPreviewComponent's `showBorder`) can pass the full radius so the
// face fills the whole circle instead of leaving a gap for a ring that's never drawn.
export function drawTokenFace(
  ctx: CanvasRenderingContext2D,
  r: number,
  border: TokenBorder,
  image: CanvasImageSource | null,
  fallbackFill: string,
  faceR: number = tokenBorderInnerRadius(r, border),
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, faceR, 0, Math.PI * 2);
  ctx.closePath();
  const fill = border.backgroundColor ?? (image ? null : fallbackFill);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (image) {
    ctx.clip();
    const size = faceR * (border.faceScale / 100);
    ctx.drawImage(image, -size, -size, size * 2, size * 2);
  }
  ctx.restore();
}

// Dash/gap lengths stretched slightly so a whole number of them fits the circle — otherwise the
// last dash runs into the first at the 3 o'clock seam.
function evenDash(radius: number, dash: number, gap: number): number[] {
  const circumference = 2 * Math.PI * radius;
  const count = Math.max(4, Math.round(circumference / (dash + gap)));
  const scale = circumference / (count * (dash + gap));
  return [dash * scale, gap * scale];
}

function strokeArc(ctx: CanvasRenderingContext2D, radius: number, lineWidth: number) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function strokeRings(ctx: CanvasRenderingContext2D, rings: Ring[], border: TokenBorder) {
  for (const ring of rings) {
    if (border.pattern === 'dashed') {
      ctx.lineCap = 'butt';
      ctx.setLineDash(evenDash(ring.radius, ring.lineWidth * 3, ring.lineWidth * 2));
    } else if (border.pattern === 'dotted') {
      // A near-zero dash with round caps paints one dot per dash.
      ctx.lineCap = 'round';
      ctx.setLineDash(evenDash(ring.radius, 0.001, ring.lineWidth * 2.2));
    } else {
      ctx.setLineDash([]);
    }
    strokeArc(ctx, ring.radius, ring.lineWidth);
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
}

// Blends across the ring's thickness: `color` on the outer edge fading to `gradientColor` on the
// inner edge. Spans the whole band, so a double ring gets one color per ring.
function ringGradient(
  ctx: CanvasRenderingContext2D,
  rings: Ring[],
  border: TokenBorder,
): CanvasGradient {
  const inner = Math.min(...rings.map((ring) => ring.radius - ring.lineWidth / 2));
  const outer = Math.max(...rings.map((ring) => ring.radius + ring.lineWidth / 2));
  const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
  gradient.addColorStop(0, border.gradientColor!);
  gradient.addColorStop(1, border.color);
  return gradient;
}

// The accent stripe. A solid ring gets a thin stripe down its middle (drawn on top); the other
// patterns get it underneath — filling the gap of a double ring, and showing between dashes or
// threading the dots like beads on a string.
function strokeBand(
  ctx: CanvasRenderingContext2D,
  rings: Ring[],
  border: TokenBorder,
  onTop: boolean,
) {
  if (!border.bandColor || onTop !== (border.pattern === 'solid')) return;
  ctx.strokeStyle = border.bandColor;
  const [ring, inner] = rings;
  if (border.pattern === 'solid') strokeArc(ctx, ring.radius, ring.lineWidth * 0.35);
  else if (border.pattern === 'double')
    strokeArc(ctx, (ring.radius + inner.radius) / 2, ring.lineWidth * 1.1);
  else if (border.pattern === 'dashed') strokeArc(ctx, ring.radius, ring.lineWidth);
  else strokeArc(ctx, ring.radius, ring.lineWidth * 0.4);
}

// Light catching the ring's outer edge and shadow on its inner edge, so it reads as raised.
function bevel(ctx: CanvasRenderingContext2D, rings: Ring[], border: TokenBorder) {
  for (const ring of rings) {
    const g = ctx.createRadialGradient(
      0,
      0,
      ring.radius - ring.lineWidth / 2,
      0,
      0,
      ring.radius + ring.lineWidth / 2,
    );
    g.addColorStop(0, 'rgba(0,0,0,0.4)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.strokeStyle = g;
    strokeRings(ctx, [ring], border);
  }
}

// A polished sheen: lit from the top-left, shadowed toward the bottom-right.
function sheen(ctx: CanvasRenderingContext2D, rings: Ring[], border: TokenBorder, r: number) {
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.strokeStyle = g;
  strokeRings(ctx, rings, border);
}

function studs(ctx: CanvasRenderingContext2D, ring: Ring, color: string) {
  const size = Math.max(0.8, ring.lineWidth * 0.3);
  const count = Math.max(6, Math.round((2 * Math.PI * ring.radius) / (ring.lineWidth * 3.5)));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = Math.cos(angle) * ring.radius;
    const y = Math.sin(angle) * ring.radius;
    ctx.beginPath();
    ctx.arc(x + size * 0.25, y + size * 0.25, size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
  }
}

// Shading and texture over the ring color. Studs follow a continuous ring, so they're only drawn
// on solid/double; dashed and dotted rings still get the metal shading.
function strokeMaterial(
  ctx: CanvasRenderingContext2D,
  rings: Ring[],
  border: TokenBorder,
  r: number,
) {
  if (border.material === 'flat') return;
  sheen(ctx, rings, border, r);
  bevel(ctx, rings, border);
  const continuous = border.pattern === 'solid' || border.pattern === 'double';
  if (border.material === 'studded' && continuous) studs(ctx, rings[0], border.color);
}

// Strokes the ring around a token of outer radius `r` centered on the context's origin. Takes a
// raw 2D context (Konva's sceneFunc passes `context._context`) so the battle map and the portrait
// dialog's preview draw from exactly the same code.
export function strokeTokenBorder(ctx: CanvasRenderingContext2D, r: number, border: TokenBorder) {
  const rings = ringsFor(r, border);
  ctx.save();
  strokeBand(ctx, rings, border, false);
  ctx.strokeStyle = border.gradientColor ? ringGradient(ctx, rings, border) : border.color;
  strokeRings(ctx, rings, border);
  strokeMaterial(ctx, rings, border, r);
  strokeBand(ctx, rings, border, true);
  ctx.restore();
}

// Whether the art has see-through areas (a built avatar, a cut-out PNG) rather than being an
// opaque square photo — sampled once per image on a small offscreen canvas. Only transparent art
// pops out of the frame: an opaque photo would just cover the ring with a square-cornered block.
const transparencyCache = new WeakMap<object, boolean>();

export function artHasTransparency(image: CanvasImageSource): boolean {
  const cached = transparencyCache.get(image);
  if (cached !== undefined) return cached;
  let transparent = false;
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      let clear = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) clear++;
      transparent = clear > size * size * 0.05;
    }
  } catch {
    // A tainted or not-yet-decoded image can't be sampled — treat it as opaque.
  }
  transparencyCache.set(image, transparent);
  return transparent;
}

// Whether `degrees` (0° at 3 o'clock, counterclockwise) falls inside the wedge. Equal bounds are
// an empty wedge; a start above the end wraps through 0°.
export function popOutContains(range: TokenPopOutRange, degrees: number): boolean {
  if (range.start === range.end) return false;
  const d = ((degrees % 360) + 360) % 360;
  const start = range.start % 360;
  const end = range.end === 360 ? 360 : range.end % 360;
  return start < end ? d >= start && d < end : d >= start || d < end;
}

// Which sides of the token the pop-out wedges reach into, so a caller can reserve headroom there.
export function popOutSides(ranges: readonly TokenPopOutRange[]) {
  const sides = { top: false, right: false, bottom: false, left: false };
  for (let deg = 0; deg < 360; deg++) {
    const mid = deg + 0.5;
    if (!ranges.some((range) => popOutContains(range, mid))) continue;
    const rad = (mid * Math.PI) / 180;
    if (Math.sin(rad) > 0) sides.top = true;
    if (Math.sin(rad) < 0) sides.bottom = true;
    if (Math.cos(rad) > 0) sides.right = true;
    if (Math.cos(rad) < 0) sides.left = true;
  }
  return sides;
}

// A zoomed-in portrait drawn again, unclipped by the ring, inside the border's pop-out wedges —
// by default the top half, so the character's head breaks out over the top of the frame while the
// bottom half stays inside it.
export function drawTokenPopOut(
  ctx: CanvasRenderingContext2D,
  r: number,
  border: TokenBorder,
  image: CanvasImageSource,
) {
  const size = tokenBorderInnerRadius(r, border) * (border.faceScale / 100);
  // Canvas y points down, so a counterclockwise angle θ is canvas angle -θ; the radius just has to
  // reach past the image's corner.
  const reach = size * 2;
  ctx.save();
  ctx.beginPath();
  for (const { start, end } of border.popOut) {
    if (start === end) continue;
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, (-start * Math.PI) / 180, (-end * Math.PI) / 180, true);
    ctx.closePath();
  }
  ctx.clip();
  ctx.drawImage(image, -size, -size, size * 2, size * 2);
  ctx.restore();
}

// The largest ring radius that still keeps a pop-out (see drawTokenPopOut) within
// `canvasHalfSize` of the center — i.e. the token's own face-image zoom and transparency decide
// whether the pop-out even triggers; this just makes sure that, when it does, it has room to
// actually fit, so a tight canvas (a portrait thumbnail, with no surrounding "floor" to bleed
// onto like the battle map has) never needs to clip it. Below 100% zoom (or without transparent
// art) nothing ever pops out, so the ring can take the whole canvas as before. tokenBorderInnerRadius
// grows monotonically with r, so a plain bisection search finds the largest radius that fits.
export function maxTokenRadiusForPopout(
  canvasHalfSize: number,
  border: TokenBorder,
  image: CanvasImageSource | null,
): number {
  if (border.faceScale <= 100 || !image || !artHasTransparency(image)) return canvasHalfSize;
  const scale = border.faceScale / 100;
  let lo = 0;
  let hi = canvasHalfSize;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const extent = tokenBorderInnerRadius(mid, border) * scale;
    if (extent <= canvasHalfSize) lo = mid;
    else hi = mid;
  }
  return lo;
}

// The whole bordered token — face, ring, then (when zoomed past 100% on transparent art) the
// pop-out — in the order both the battle map and the dialog preview need.
export function drawBorderedToken(
  ctx: CanvasRenderingContext2D,
  r: number,
  border: TokenBorder,
  image: CanvasImageSource | null,
  fallbackFill: string,
) {
  drawTokenFace(ctx, r, border, image, fallbackFill);
  strokeTokenBorder(ctx, r, border);
  if (image && border.faceScale > 100 && border.popOut.length && artHasTransparency(image)) {
    drawTokenPopOut(ctx, r, border, image);
  }
}
