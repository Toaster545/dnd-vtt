import { TokenBorder, TokenBorderPattern } from '../models/token-border.model';

export const TOKEN_BORDER_MIN_WIDTH = 1;
export const TOKEN_BORDER_MAX_WIDTH = 10;

// Borders saved before thickness became a slider stored a named size instead.
const LEGACY_WIDTHS: Record<string, number> = { thin: 2, normal: 5, thick: 8 };

export const TOKEN_BORDER_PATTERNS: readonly { id: TokenBorderPattern; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'double', label: 'Double' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
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
};

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeTokenBorder(value: unknown): TokenBorder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { color, width, pattern, gradientColor } = value as Record<string, unknown>;
  if (!isHex(color)) return null;
  const level = typeof width === 'string' ? LEGACY_WIDTHS[width] : (width as number);
  if (
    !Number.isInteger(level) ||
    level < TOKEN_BORDER_MIN_WIDTH ||
    level > TOKEN_BORDER_MAX_WIDTH
  ) {
    return null;
  }
  if (!TOKEN_BORDER_PATTERNS.some((option) => option.id === pattern)) return null;
  if (gradientColor != null && !isHex(gradientColor)) return null;
  return {
    color: color.toLowerCase(),
    width: level,
    pattern: pattern as TokenBorderPattern,
    gradientColor: gradientColor ? gradientColor.toLowerCase() : null,
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

// Dash/gap lengths stretched slightly so a whole number of them fits the circle — otherwise the
// last dash runs into the first at the 3 o'clock seam.
function evenDash(radius: number, dash: number, gap: number): number[] {
  const circumference = 2 * Math.PI * radius;
  const count = Math.max(4, Math.round(circumference / (dash + gap)));
  const scale = circumference / (count * (dash + gap));
  return [dash * scale, gap * scale];
}

function strokeRings(ctx: CanvasRenderingContext2D, rings: Ring[], border: TokenBorder) {
  for (const ring of rings) {
    ctx.beginPath();
    ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
    ctx.lineWidth = ring.lineWidth;
    if (border.pattern === 'dashed') {
      ctx.lineCap = 'butt';
      ctx.setLineDash(evenDash(ring.radius, ring.lineWidth * 3, ring.lineWidth * 2));
    } else if (border.pattern === 'dotted') {
      // A near-zero dash with round caps paints one dot per dash.
      ctx.lineCap = 'round';
      const [dash, gap] = evenDash(ring.radius, 0.001, ring.lineWidth * 2.2);
      ctx.setLineDash([dash, gap]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
  }
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

// Strokes the ring around a token of outer radius `r` centered on the context's origin. Takes a
// raw 2D context (Konva's sceneFunc passes `context._context`) so the battle map and the portrait
// dialog's preview draw from exactly the same code.
export function strokeTokenBorder(ctx: CanvasRenderingContext2D, r: number, border: TokenBorder) {
  const rings = ringsFor(r, border);
  ctx.save();
  ctx.strokeStyle = border.gradientColor ? ringGradient(ctx, rings, border) : border.color;
  strokeRings(ctx, rings, border);
  ctx.restore();
}
