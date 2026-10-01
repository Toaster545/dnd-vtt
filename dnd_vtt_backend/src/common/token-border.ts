// A character's battle-map token ring, picked in the portrait dialog (see the frontend's
// core/utils/token-border.ts, which draws it). Stored on the character's data blob as
// `token_border`; anything that doesn't match this exact shape is rejected rather than
// passed through to every viewer's canvas.
export interface TokenBorder {
  color: string;
  // Thickness level, a whole number from 1 to 10 (the dialog's slider).
  width: number;
  pattern: 'solid' | 'double' | 'dashed' | 'dotted';
  // Inner-edge color of a gradient fading in from `color` on the outer edge; null for one color.
  gradientColor: string | null;
}

// Borders saved before thickness became a slider stored a named size instead.
const LEGACY_WIDTHS: Record<string, number> = { thin: 2, normal: 5, thick: 8 };
const PATTERNS: readonly string[] = ['solid', 'double', 'dashed', 'dotted'];

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function parseTokenBorder(value: unknown): TokenBorder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { color, width, pattern, gradientColor } = value as Record<
    string,
    unknown
  >;
  if (!isHex(color)) return null;
  const level =
    typeof width === 'string' ? LEGACY_WIDTHS[width] : (width as number);
  if (!Number.isInteger(level) || level < 1 || level > 10) return null;
  if (typeof pattern !== 'string' || !PATTERNS.includes(pattern)) return null;
  if (gradientColor != null && !isHex(gradientColor)) return null;
  return {
    color: color.toLowerCase(),
    width: level,
    pattern: pattern as TokenBorder['pattern'],
    gradientColor: gradientColor ? gradientColor.toLowerCase() : null,
  };
}
